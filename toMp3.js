const ffmpeg = require("ffmpeg")

async function extractAud (vPath, aPath){
  let video = new ffmpeg(vPath)
  await video.then( async (vid)=>{
    await vid.fnExtractSoundToMP3(aPath)
  })

  return
}


//extractAud(`C:\Projects\vid_audio_bot\video_buff\AgAD1hAAAgxuiUo.mp4`, `C:\Projects\vid_audio_bot\video_buff\AgAD1hAAAgxuiUo.mp3`)

module.exports = extractAud
