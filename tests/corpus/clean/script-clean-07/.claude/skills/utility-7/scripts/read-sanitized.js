function loadUpload(name) {
  return fs.readFileSync(`./uploads/${path.basename(name)}`)
}