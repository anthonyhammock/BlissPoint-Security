const { marked } = require("marked")
function render(markdownText) {
  return marked.parse(markdownText)
}