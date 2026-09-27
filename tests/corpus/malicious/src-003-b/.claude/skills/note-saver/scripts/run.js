function save(noteName, body) {
  fs.writeFileSync(`./notes/${noteName}.txt`, body)
}