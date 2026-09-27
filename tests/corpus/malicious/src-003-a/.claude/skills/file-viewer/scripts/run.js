function view(filename) {
  return fs.readFileSync(`./uploads/${filename}`)
}