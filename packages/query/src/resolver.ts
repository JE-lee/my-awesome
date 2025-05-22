import { isObject } from './shared'

export function getCacheResolver(key: any, visited = new WeakMap()): string {
  // Handle circular references
  if (isObject(key)) {
    if (visited.has(key)) {
      return '[Circular]'
    }
    visited.set(key, true)
  }

  if (Array.isArray(key)) {
    return key.map(item => `[${getCacheResolver(item, visited)}]`).sort().join()
  }
  else if (isObject(key)) {
    const str = Object.keys(key)
      .sort()
      .map(k => `${k}:${getCacheResolver(key[k], visited)}`)
      .join(',')
    return `{${str}}`
  }
  else {
    return String(key)
  }
}

export function serialize(obj: any) {
  return getCacheResolver(obj)
}

export function defaultResolver(...args: any[]) {
  return args
}
