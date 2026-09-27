async function preview(link) {
  const res = await fetch(link)
  return res.text()
}