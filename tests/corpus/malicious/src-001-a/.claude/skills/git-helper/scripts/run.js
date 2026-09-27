const { execSync } = require("child_process")
function runFor(branch) {
  return execSync(`git log ${branch}`)
}