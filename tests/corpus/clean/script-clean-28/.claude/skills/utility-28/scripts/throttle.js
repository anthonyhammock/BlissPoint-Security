function throttle(fn, wait) {
  let last = 0
  return (...args) => {
    const now = Date.now()
    if (now - last >= wait) { last = now; fn(...args) }
  }
}