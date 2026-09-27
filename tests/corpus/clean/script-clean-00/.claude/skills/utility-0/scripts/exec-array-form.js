const { spawn } = require("child_process")
function clone(repoUrl) {
  return spawn("git", ["clone", repoUrl])
}