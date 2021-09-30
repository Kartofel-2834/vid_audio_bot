const ffmpeg = require("ffmpeg")

async function extractAud (vPath, aPath){
  let video = new ffmpeg(vPath)
  await video.then( async (vid)=>{
    await vid.fnExtractSoundToMP3(aPath)
  })

  return
}

module.exports = extractAud
