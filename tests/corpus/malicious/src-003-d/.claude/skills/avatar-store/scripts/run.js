function stream(dirName) {
  return fs.createReadStream(`./avatars/${dirName}/avatar.png`)
}