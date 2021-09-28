const fs = require("fs")
const path = require("path")
const axios = require("axios")
const queryString = require("query-string")
const staticData = require( path.join(__dirname, "static.js") )
const VidAudBot = require( path.join(__dirname, "vidaudbot_4.js") )
const ffmpeg = require('ffmpeg')
const http = require('https')
const mongoose = require("mongoose")
const easyvk = require('easyvk')

const TelegramBot = require('node-telegram-bot-api')
const express = require("express")
const app = express()

const tgToken = staticData.telegramBotToken

async function start(){
  await mongoose.connect( staticData.mongoConnectUrl, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    //useFindAndModify: false,
  }).then( console.log("Mongo connected") ).catch( err=> console.log(err) )

  users = await staticData.user_schema

  let bot = new TelegramBot(tgToken, {
    polling: true,
    filepath:false,
  })

  let vkAccess = await vkAuth( staticData.myVkLogin, staticData.myVkPassword )

  let vidAudBot = new VidAudBot( bot, users, vkAccess )

  console.log(users)
}


start()


/*app.get("/", (req, res)=>{
  res.redirect( staticData.vkAuthLink )
})*/

app.get("/vkCheck", async (req, res)=>{
  if( !req.query.code ){ res.sendStatus(200); return }

  let vkRes = await axios.get("https://oauth.vk.com/access_token", {
    params: {
      client_id: staticData.myVkAppData.id,
      client_secret: staticData.myVkAppData.secret,
      redirect_uri: "http://localhost:5000/vkCheck",
      code: req.query.code,
    }
  })

  await users.findOneAndUpdate({ _id: req.query.state }, {
    $set: {
      vk_user_id: vkRes.data.user_id,
      vk_access_token: vkRes.data.access_token,
    }
  })

  res.send(vkRes.data)
})

app.listen(5000, ()=>{ console.log("Server working on port 5000...") })


async function vkAuth(login, pass){
  let answer = null

  await easyvk({
    username: login,
    password: pass,
    sessionFile: path.join(__dirname, '.my-session')
  }).then(async vk => {
    answer = {
      client_secret: vk.params.client_secret,
      token: vk.session.access_token,
      id: vk.params.client_id
    }
  })

  return answer
}
