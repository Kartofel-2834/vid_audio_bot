const fs = require("fs")
const http = require('https')

async function download(url, filename, cb){
  const file = fs.createWriteStream(filename);
  await http.get(url, (response)=>{
    response.pipe(file)

    file.on('finish', function() { file.close(cb) })
  }).on( "error", (err)=>{ fs.unlink(filename) })
}

module.exports = download
