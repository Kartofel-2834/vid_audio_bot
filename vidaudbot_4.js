const fs = require("fs")
const path = require("path")
const axios = require("axios")
const queryString = require("query-string")
const ffmpeg = require('ffmpeg')
const http = require('https')
const mongoose = require("mongoose")

const staticData = require( path.join(__dirname, "static.js") )
const download = require( path.join(__dirname, "download.js") )
const extractAud = require( path.join(__dirname, "toMp3.js") )

const TelegramBot = require('node-telegram-bot-api')

/*Array.prototype.maxNumVal = function(){
  return Math.max.apply(null, this);
}*/

class VidAudBot {
  constructor( bot, usersData, vkAccess ) {
    this.vkAccess = vkAccess
    this.commands = [ "/vkvideo" ]
    this.usersData = usersData
    this.bot = bot
    this.token = staticData.telegramBotToken

    this.bot.on("message", async (msg)=>{
      console.log(`${ msg.from.first_name } ${ msg.from.last_name } написал: ${ msg.text }`)

      if( this.commands.indexOf( msg.text ) != -1 ){ return }

      this.msgLitener(msg)
    })

    this.bot.onText( /\/vkvideo/, async (msg)=>{
      let cracker = staticData.smiles.cracker

      this.bot.sendMessage( msg.chat.id, "Посмотреть результат", {
        reply_markup:{
          inline_keyboard: [[{
            text: `${ cracker } Ну давай уже! ${ cracker }`,
            callback_data: "vkv"
          }]]
        }
      })
    })

    this.bot.on( "callback_query", async ( query )=>{
      let msg = query.message
      let parsedData = query.data.split("=")

      parsedData = {
        key: parsedData[0],
        data: parsedData[1] ? parsedData[1] : null
      }

      switch ( parsedData.key ) {
        case "vkv":
          let firstPage = await this.createVideoBookMessage( query )

          if( !firstPage || !firstPage[0] ){ return }

          firstPage = firstPage[0]
          this.changePage( msg, firstPage )
        break

        case "pageScroll":
          let scroll = parsedData.data == '+' ? 1 : -1

          let needfulMsg = await this.usersData.findOneAndUpdate({
              chat_id: msg.chat.id,
              "message.id": msg.message_id,
          },
          {
            $inc: { "message.$.pageNow": scroll }
          })

          if( !needfulMsg || !needfulMsg.message ){ return }

          needfulMsg = needfulMsg.message.filter( e => e.id == msg.message_id )[0]
          needfulMsg.pageNow += scroll

          if( needfulMsg.pageNow > needfulMsg.pages.length - 1 ){
            needfulMsg.pageNow = needfulMsg.pages.length - 1

            await this.usersData.findOneAndUpdate({
                chat_id: msg.chat.id,
                "message.id": msg.message_id,
            },
            {
              $set: { "message.$.pageNow": needfulMsg.pageNow }
            })

            return
          }

          this.changePage( msg, needfulMsg.pages[ needfulMsg.pageNow ] )
        break

        case "deleteMsg":
          this.deleteMsg( msg )
        break

        case "getvid":
          let bookMsg = await this.usersData.findOne(
            { chat_id: msg.chat.id, "message.id": msg.message_id },
            { "message.$": 1 }
          )

          let videoIndex = Number( parsedData.data )

          if( !bookMsg || !bookMsg.message || bookMsg.length == 0 ){
            this.deleteMsg( msg )
            return
          }

          bookMsg = bookMsg.message[0]
          let choosedVideo = bookMsg.pages[ bookMsg.pageNow ].videos[ videoIndex ]

          this.sendVkVideoQualityChoiceMessage( msg, choosedVideo, videoIndex, bookMsg.pageNow )
        break

        case "vkVideoDownload":
          this.bot.deleteMessage(msg.chat.id, msg.message_id)

          let qData = parsedData.data.split(":").map( e => Number(e) )

          if( !qData.length || qData.length < 5 ){ return }

          qData = {
            quality: qData[0],
            msgId: qData[1],
            vidInd: qData[2],
            pageInd: qData[3],
            audio: qData[4] == 1
          }

          let videoMsg = await this.usersData.findOne(
            { chat_id: msg.chat.id, "message.id": qData.msgId },
            { "message.$": 1 }
          )

          if( !videoMsg ){ return }

          videoMsg = videoMsg.message[0]

          let video = videoMsg.pages[ qData.pageInd ].videos[ qData.vidInd ]
          let videoUrl = video.files[`mp4_${ qData.quality }`]
          let downloadPath = path.join( __dirname, 'video_buff', `${ msg.message_id }.mp4` )

          let cb = ()=>{
            fs.readFile( downloadPath, (err, data)=>{
              if (err) { this.bot.sendMessage( msg.chat.id, "Не удалось получить видео" ) }
              else{ this.bot.sendVideo( msg.chat.id, data ) }

              fs.unlink( downloadPath, (err)=>{ if(err){ throw err } } )
            })
          }

          if ( qData.audio ){
            cb = async ()=>{
              let audioPath = path.join( __dirname, 'audio_buff', `${ msg.message_id }.mp3` )

              this.getAudioFromVideo( downloadPath, audioPath, (err, data)=>{
                if( err ){ console.log(err); return }

                bot.sendAudio(msg.chat.id, data, { title: video.title ? video.title : 'Какой-то звук' })
              })
            }
          }

          download( videoUrl, downloadPath, cb )
        break
      }

    })
  }

  async deleteMsg( msg ){
    this.bot.deleteMessage(msg.chat.id, msg.message_id)

    await this.usersData.findOneAndUpdate({ chat_id: msg.chat.id },{
      $pull: { message: { id: msg.message_id } }
    })
  }

  async sendVkVideoQualityChoiceMessage( msg, video, vidInd, pageInd ){
    let imagesAllWidths = video.image.map( e => e.width )
    let imageIndex = imagesAllWidths.indexOf( Math.max.apply(null, imagesAllWidths) )
    let image = video.image[ imageIndex ]

    let qualities = Object.keys( video.files ).filter( e => /mp4_/.test(e) )
    qualities = qualities.map( e => e.split("_")[1] )

    let markup = [
      [{
        text: `Audio`,
        callback_data: `vkVideoDownload=${ qualities[0] }:${ msg.message_id }:${ vidInd }:${ pageInd }:1`
      }]
    ]

    for ( let q of qualities ){
      markup.push([{
        text: `${ q }p`,
        callback_data: `vkVideoDownload=${ q }:${ msg.message_id }:${ vidInd }:${ pageInd }:0`
      }])
    }

    this.bot.sendPhoto( msg.chat.id, image.url, {
      caption: `${ video.title }\n\n <i>ВЫБЕРИТЕ КАЧЕСТВО ВИДЕО:</i>`,
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: markup }
    })
  }

  changePage( msg, page ){
    this.bot.editMessageText( page.front.text, {
      parse_mode: "HTML",
      reply_markup: page.front.markup,
      message_id: msg.message_id,
      chat_id: msg.chat.id
    })
  }

  async findOrMakeBotUser( msg ){
    let user = await this.usersData.findOne({ chat_id: msg.chat.id })

    if( !user ){
      user = await users.create({ chat_id: msg.chat.id, message: [] })
    }

    return user
  }

  async createVideoBookMessage( query ){
    let msg = query.message
    let userVideoLink = await this.getVkVideoLink( msg )

    if( !userVideoLink ){ return null }

    let pages = splitLinkIntoPages( userVideoLink )

    let newBookMessage = {
      id: msg.message_id,
      pageNow: 0,
      pages: pages,
    }

    await this.usersData.findOneAndUpdate({ chat_id: msg.chat.id }, {
      $push:{ message: newBookMessage }
    })

    return pages
  }

  async getVkVideoLink( msg ){
    let res = await axios.post(`https://api.vk.com/method/video.get?access_token=${this.vkAccess.token}&v=5.131&count=200`,{
      params:{ owner_id: this.vkAccess.id, extended: 1 }
    })

    res = res.data.response.items ? res.data.response.items : null

    console.log( res[res.length -1].title )
    console.log( res.length )

    if( !res ){
      this.bot.sendMessage( msg.chat.id, "Не удалось получить видео" )
      return null
    }

    return res
  }

  async getVideo( video, dPath, cb = ()=>{} ){
    let vidReqPath = await axios.post( `https://api.telegram.org/bot${ this.token }/getFile?file_id=${ video.file_id }` )

    if( !vidReqPath.data || !vidReqPath.data.ok ){
      this.bot.sendMessage("Не удалось получить видео")
      return
    }

    vidReqPath = vidReqPath.data.result.file_path

    let vidDownloadUrl = `https://api.telegram.org/file/bot${ this.token }/${ vidReqPath }`

    download( vidDownloadUrl, dPath, cb)

    return dPath
  }

  async getAudioFromVideo(vPath, aPath, cb){
    await extractAud( vPath, aPath )

    await fs.readFile( aPath, cb )

    fs.unlink( vPath, (err)=>{ if(err){ console.log(err) } } )
    fs.unlink( aPath, (err)=>{ if(err){ console.log(err) } } )
  }

  checkVideo( video ){
    if( !video ){
      return { ok: false, error: "Отправьте видео" }
    }

    if( video.file_size > 15*8*1024*1024 ){
      return { ok: false, error: "Видео слишком большое" }
    }

    let ext = staticData.vidMimeTypes.indexOf( video.mime_type )
    ext = ext == -1 ? null : staticData.vidExt[ ext ]

    if( !ext ){
      return { ok: false, error: "Недопустимый формат видео" }
    }

    return { ok: true }
  }

  async msgLitener( msg ){
    let video = msg.video
    let videoCheckInfo = this.checkVideo( video )

    if( !videoCheckInfo.ok ){
      this.bot.sendMessage( msg.chat.id, videoCheckInfo.error ); return
    }

    let ext = staticData.vidMimeTypes.indexOf( video.mime_type )
    ext = staticData.vidExt[ ext ]

    let vPath = path.join(staticData.videoBuffPath, `${ video.file_unique_id }${ext}`)
    let aPath = path.join(staticData.audioBuffPath, `${ video.file_unique_id }.mp3`)

    this.getVideo( video, vPath, ()=>{
      this.getAudioFromVideo( vPath, aPath, (err, data)=>{
        if(err){ console.log(err); return }

        let caption = msg.caption ? msg.caption : "Какой-то звук"

        this.bot.sendAudio( msg.chat.id, data, { title: caption })
      })
    })
  }

}

function splitLinkIntoPages( link ){
  let answer = []
  let pageBuff = []
  let enterRow = ()=>{
    answer.push( pageBuff )
    pageBuff = []
  }

  console.log( link.length )

  for( let title of link ){
    pageBuff.push( title )

    if( pageBuff.length == 10 ){ enterRow() }
  }

  if( pageBuff.length > 0 ){ enterRow() }

  answer = answer.map( (e, i)=>{ return pageMaker(e, i, answer.length, answer.length) } )

  return answer
}

function pageMaker( linkOfVideos, ind, vidLength, pageCount ){
  let text = `<b>Страница ${ ind+1 } из ${ pageCount }</b>\n`
  let markup = []
  let buttonRow = []
  let enterRow = ()=>{
    markup.push( buttonRow )
    buttonRow = []
  }

  linkOfVideos.forEach( ( video, i )=>{
    text += `\n<b>${ i+1 }.</b>  <i>${ video.title }</i>`

    buttonRow.push({ text: `${ i+1 }`, callback_data: `getvid=${ i }` })

    if( buttonRow.length == 5 ){ enterRow() }
  })

  if( buttonRow.length > 0 ){ enterRow() }

  markup.push( pageNavButtons( ind, vidLength ) )

  return {
    index: ind,
    front: { text: text, markup: { inline_keyboard: markup } },
    videos: linkOfVideos,
  }
}

function pageNavButtons(i, leng){
  let smiles = staticData.smiles
  let answer = []

  if( i > 0 ){
    answer.push( { text: smiles.backArrow, callback_data:"pageScroll=-" } )
  }

  answer.push( { text: smiles.cross, callback_data:"deleteMsg" } )

  if( i < leng-1 ){
    answer.push( { text: smiles.nextArrow, callback_data:"pageScroll=+" } )
  }

  return answer
}

module.exports = VidAudBot
