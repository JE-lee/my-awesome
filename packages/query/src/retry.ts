export function retryAsync<Args extends any[], R, Ctx = any>(fn: (this: Ctx, ...args: Args) => Promise<R>, times = 0) {
  let count = 0
  function _retry(this: Ctx, ...args: Args): Promise<R> {
    return fn.apply(this, args).catch((err) => {
      if (count < times) {
        count += 1
        return _retry.apply(this, args)
      }
      else {
        throw err
      }
    })
  }
  return _retry
}

export function timeout<Args extends any[], R, Ctx = any>(fn: (this: Ctx, ...args: Args) => Promise<R>, timeout: number) {
  const delay = (t: number) => new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), t))
  return timeout >= 0
    ? function _race(this: Ctx, ...args: Args) {
      return Promise.race([fn.apply(this, args), delay(timeout)])
    }
    : fn
}

export function retryAsyncUtil<Args extends any[], R, Ctx = any>(fn: (this: Ctx, ...args: Args) => Promise<R>, times = 0, overtime = 0) {
  return timeout(retryAsync(fn, times), overtime)
}
