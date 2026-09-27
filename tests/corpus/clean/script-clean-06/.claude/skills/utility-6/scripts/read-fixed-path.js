function loadConfig() {
  return fs.readFileSync("./config/settings.json", "utf8")
}