async function retry(fn, times) {
  for (let i = 0; i < times; i++) {
    try { return await fn() } catch (e) { if (i === times - 1) throw e }
  }
}