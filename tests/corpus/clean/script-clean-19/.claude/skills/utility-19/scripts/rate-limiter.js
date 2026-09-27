function rateLimiter(maxPerSecond) {
  let tokens = maxPerSecond
  setInterval(() => { tokens = maxPerSecond }, 1000)
  return () => tokens-- > 0
}