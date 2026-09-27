async function getStatus() {
  const res = await fetch("https://status.example.com/api")
  return res.json()
}