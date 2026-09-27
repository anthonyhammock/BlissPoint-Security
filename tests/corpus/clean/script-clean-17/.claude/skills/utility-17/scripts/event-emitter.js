class Emitter {
  constructor() { this.listeners = {} }
  on(name, fn) { (this.listeners[name] ??= []).push(fn) }
  emit(name, ...args) { (this.listeners[name] ?? []).forEach((fn) => fn(...args)) }
}