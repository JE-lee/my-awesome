import { cacheQuery, throttleQuery } from './query'

describe('throttleQuery', () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('should throttle function calls', async () => {
    const mockFn = jest.fn().mockImplementation(async _value => _value)
    const resolver = (_value: number) => 'default'
    const throttled = throttleQuery(mockFn, 10, resolver)

    // Start multiple calls in quick succession
    const promise1 = throttled(1)
    const promise2 = throttled(2)
    const promise3 = throttled(3)

    // Only the last call should execute after the throttle duration
    expect(mockFn).not.toHaveBeenCalled()

    // Advance time past throttle duration
    jest.advanceTimersByTime(11)

    // Only one call should have been made with the last value
    await Promise.all([promise1, promise2, promise3])
    expect(mockFn).toHaveBeenCalledTimes(1)
    expect(mockFn).toHaveBeenCalledWith(3)
  })

  it('should group calls by resolver key', async () => {
    const mockFn = jest.fn().mockImplementation(async (key, _value) => _value)
    const resolver = (key: string, _value: number) => key
    const throttled = throttleQuery(mockFn, 10, resolver)

    // Calls with different group keys
    const promiseA1 = throttled('A', 1)
    const promiseA2 = throttled('A', 2)
    const promiseB1 = throttled('B', 3)
    const promiseB2 = throttled('B', 4)

    // Advance time past throttle duration
    jest.advanceTimersByTime(11)

    // Should have made one call per group with the last value for each group
    await Promise.all([promiseA1, promiseA2, promiseB1, promiseB2])
    expect(mockFn).toHaveBeenCalledTimes(2)
    expect(mockFn).toHaveBeenCalledWith('A', 2)
    expect(mockFn).toHaveBeenCalledWith('B', 4)
  })

  it('should resolve all promises with the latest result in a group', async () => {
    const mockFn = jest.fn().mockImplementation(async _value => `result-${_value}`)
    const resolver = (_value: number) => 'default'
    const throttled = throttleQuery(mockFn, 10, resolver)

    // Start multiple calls in quick succession
    const promise1 = throttled(1)
    const promise2 = throttled(2)
    const promise3 = throttled(3)

    // Advance time past throttle duration
    jest.advanceTimersByTime(11)

    // All promises should resolve with the result of the last call
    const [result1, result2, result3] = await Promise.all([promise1, promise2, promise3])
    expect(result1).toBe('result-3')
    expect(result2).toBe('result-3')
    expect(result3).toBe('result-3')
  })

  it('should reject all promises if the function throws', async () => {
    const error = new Error('Test error')
    const mockFn = jest.fn().mockImplementation(async (_value) => {
      throw error
    })
    const resolver = (_value: number) => 'default'
    const throttled = throttleQuery(mockFn, 10, resolver)

    // Start multiple calls
    const promise1 = throttled(1)
    const promise2 = throttled(2)

    // Advance time past throttle duration
    jest.advanceTimersByTime(11)

    // All promises should reject with the same error
    await expect(promise1).rejects.toThrow(error)
    await expect(promise2).rejects.toThrow(error)
  })

  it('should reject if resolver function throws', async () => {
    const mockFn = jest.fn().mockImplementation(async _value => _value)
    const resolverError = new Error('Resolver error')
    const resolver = (_value: number) => {
      throw resolverError
    }
    const throttled = throttleQuery(mockFn, 10, resolver)

    await expect(throttled(1)).rejects.toThrow('Resolver function failed')
    expect(mockFn).not.toHaveBeenCalled()
  })

  it('should handle calls at different times', async () => {
    const mockFn = jest.fn().mockImplementation(async _value => `result-${_value}`)
    const resolver = (_value: number) => 'default'
    const throttled = throttleQuery(mockFn, 10, resolver)

    // First batch of calls
    const promise1 = throttled(1)
    const promise2 = throttled(2)

    jest.advanceTimersByTime(11)

    // These should resolve with result-2
    const [result1, result2] = await Promise.all([promise1, promise2])
    expect(mockFn).toHaveBeenCalledTimes(1)
    expect(mockFn).toHaveBeenCalledWith(2)
    expect(result1).toBe('result-2')
    expect(result2).toBe('result-2')

    // Second batch of calls after the throttle period
    const promise3 = throttled(3)
    const promise4 = throttled(4)

    jest.advanceTimersByTime(11)

    // These should resolve with result-4
    const [result3, result4] = await Promise.all([promise3, promise4])
    expect(mockFn).toHaveBeenCalledTimes(2)
    expect(mockFn).toHaveBeenLastCalledWith(4)
    expect(result3).toBe('result-4')
    expect(result4).toBe('result-4')
  })

  it('should not resolve earlier query results when later queries are pending', async () => {
    const mockFn = jest.fn().mockImplementation(async (value) => {
      if (value === 'A') {
        await new Promise(resolve => setTimeout(resolve, 5))
        return 'result-A'
      }
      else {
        await new Promise(resolve => setTimeout(resolve, 15))
        return 'result-B'
      }
    })
    const resolver = (_value: string) => 'default'
    const throttled = throttleQuery(mockFn, 10, resolver)

    // Start query A
    const promiseA = throttled('A')
    // 5ms 后触发 queryB
    jest.advanceTimersByTime(11)
    const promiseB = throttled('B')

    // 推进时间到 throttle 窗口结束
    jest.advanceTimersToNextTimer(30)

    // mockFn 只会被调用一次，参数为 'B'
    expect(mockFn).toHaveBeenCalledTimes(2)
    expect(mockFn).toHaveBeenNthCalledWith(1, 'A')
    expect(mockFn).toHaveBeenNthCalledWith(2, 'B')

    // 等待所有 promise
    const [resultA, resultB] = await Promise.all([promiseA, promiseB])
    expect(resultA).toBe('result-B')
    expect(resultB).toBe('result-B')
  })
})

describe('cacheQuery', () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('should cache results within TTL', async () => {
    const mockFn = jest.fn().mockImplementation(async _value => `result-${_value}`)
    const resolver = (_value: number) => 'default'
    const cached = cacheQuery(mockFn, 10, resolver)

    // First call should execute the function
    const promise1 = cached(1)
    expect(mockFn).toHaveBeenCalledTimes(1)
    expect(mockFn).toHaveBeenCalledWith(1)

    // Second call within TTL should use cache
    const promise2 = cached(2)
    expect(mockFn).toHaveBeenCalledTimes(1) // Still only called once

    // Both should resolve with the first result
    const [result1, result2] = await Promise.all([promise1, promise2])
    expect(result1).toBe('result-1')
    expect(result2).toBe('result-1')
  })

  it('should execute new query after TTL expires', async () => {
    const mockFn = jest.fn().mockImplementation(async _value => `result-${_value}`)
    const resolver = (_value: number) => 'default'
    const cached = cacheQuery(mockFn, 10, resolver)

    // First call
    const promise1 = cached(1)
    expect(mockFn).toHaveBeenCalledTimes(1)
    await promise1

    // Advance time past TTL
    jest.advanceTimersByTime(11)

    // Second call after TTL should execute the function again
    const promise2 = cached(2)
    expect(mockFn).toHaveBeenCalledTimes(2)
    expect(mockFn).toHaveBeenLastCalledWith(2)

    const result2 = await promise2
    expect(result2).toBe('result-2')
  })

  it('should group calls by resolver key', async () => {
    const mockFn = jest.fn().mockImplementation(async (key, _value) => `result-${key}-${_value}`)
    const resolver = (key: string, _value: number) => key
    const cached = cacheQuery(mockFn, 10, resolver)

    // Calls with different group keys
    const promiseA1 = cached('A', 1)
    const promiseA2 = cached('A', 2)
    const promiseB1 = cached('B', 3)
    const promiseB2 = cached('B', 4)

    // Should have made one call per group
    expect(mockFn).toHaveBeenCalledTimes(2)
    expect(mockFn).toHaveBeenCalledWith('A', 1)
    expect(mockFn).toHaveBeenCalledWith('B', 3)

    // Results should be cached per group
    const [resultA1, resultA2, resultB1, resultB2] = await Promise.all([
      promiseA1,
      promiseA2,
      promiseB1,
      promiseB2,
    ])
    expect(resultA1).toBe('result-A-1')
    expect(resultA2).toBe('result-A-1')
    expect(resultB1).toBe('result-B-3')
    expect(resultB2).toBe('result-B-3')
  })

  it('should handle errors properly', async () => {
    const error = new Error('Test error')
    const mockFn = jest.fn().mockImplementation(async (_value) => {
      if (_value === 1)
        throw error
      return _value
    })
    const resolver = (_value: number) => 'default'
    const cached = cacheQuery(mockFn, 10, resolver)

    // First call should throw
    await expect(cached(1)).rejects.toThrow(error)

    // Second call within TTL should throw the same error
    await expect(cached(2)).resolves.toBe(2)
    expect(mockFn).toHaveBeenCalledTimes(2) // Only called once
  })

  it('should reject if resolver function throws', async () => {
    const mockFn = jest.fn().mockImplementation(async _value => _value)
    const resolverError = new Error('Resolver error')
    const resolver = (_value: number) => {
      throw resolverError
    }
    const cached = cacheQuery(mockFn, 10, resolver)

    await expect(cached(1)).rejects.toThrow('Resolver function failed')
    expect(mockFn).not.toHaveBeenCalled()
  })

  it('should handle concurrent calls correctly', async () => {
    let resolvePromise: (value: string) => void
    const mockFn = jest.fn().mockImplementation(async (_value) => {
      return new Promise((resolve) => {
        resolvePromise = resolve
      })
    })
    const resolver = (_value: number) => 'default'
    const cached = cacheQuery(mockFn, 10, resolver)

    // Start multiple concurrent calls
    const promise1 = cached(1)
    const promise2 = cached(2)
    const promise3 = cached(3)

    // All calls should share the same promise
    expect(mockFn).toHaveBeenCalledTimes(1)
    expect(mockFn).toHaveBeenCalledWith(1)

    // Resolve the promise
    resolvePromise!('result-1')

    // All promises should resolve with the same result
    const [result1, result2, result3] = await Promise.all([promise1, promise2, promise3])
    expect(result1).toBe('result-1')
    expect(result2).toBe('result-1')
    expect(result3).toBe('result-1')
  })

  it('should respect maxSize limit and remove oldest entries', async () => {
    const mockFn = jest.fn().mockImplementation(async _value => `result-${_value}`)
    const resolver = (_value: number) => `key-${_value}`
    const cached = cacheQuery(mockFn, 1000, resolver, 2) // maxSize = 2

    // First two calls should be cached
    await cached(1)
    await cached(2)
    expect(mockFn).toHaveBeenCalledTimes(2)

    // Third call should trigger removal of first entry
    await cached(3)
    expect(mockFn).toHaveBeenCalledTimes(3)

    // Call with first key again should trigger new execution
    await cached(1)
    expect(mockFn).toHaveBeenCalledTimes(4)
  })

  it('should maintain LRU order when maxSize is reached', async () => {
    const mockFn = jest.fn().mockImplementation(async _value => `result-${_value}`)
    const resolver = (_value: number) => `key-${_value}`
    const cached = cacheQuery(mockFn, 1000, resolver, 3) // maxSize = 3

    // Fill cache with 3 entries
    await cached(1)
    await cached(2)
    await cached(3)
    expect(mockFn).toHaveBeenCalledTimes(3)

    // Access key-2 to make it most recently used (但实际不会更新顺序，因为命中缓存只 get 不 set)
    await cached(2)
    expect(mockFn).toHaveBeenCalledTimes(3) // Should use cache

    // Add new entry, should remove key-1 (first entry)
    await cached(4)
    expect(mockFn).toHaveBeenCalledTimes(4)

    // Access key-1 again, should trigger new execution（因为 key-1 已被淘汰）
    await cached(1)
    expect(mockFn).toHaveBeenCalledTimes(5)

    // Access key-2 again, should trigger new execution（因为 key-2 现在是最老的且已被淘汰）
    await cached(2)
    expect(mockFn).toHaveBeenCalledTimes(6)

    // Add new entry, should remove key-3（key-3 是最老的）
    await cached(5)
    expect(mockFn).toHaveBeenCalledTimes(7)

    // Access key-3 again, should trigger new execution（因为 key-3 已被淘汰）
    await cached(3)
    expect(mockFn).toHaveBeenCalledTimes(8)
  })

  it('should handle maxSize with concurrent calls', async () => {
    const mockFn = jest.fn().mockImplementation(async _value => `result-${_value}`)
    const resolver = (_value: number) => `key-${_value}`
    const cached = cacheQuery(mockFn, 1000, resolver, 2) // maxSize = 2

    // Start multiple concurrent calls
    const promise1 = cached(1)
    const promise2 = cached(2)
    const promise3 = cached(3)

    // Should have made 3 calls since they're concurrent
    expect(mockFn).toHaveBeenCalledTimes(3)

    // Wait for all promises to resolve
    const [result1, result2, result3] = await Promise.all([promise1, promise2, promise3])
    expect(result1).toBe('result-1')
    expect(result2).toBe('result-2')
    expect(result3).toBe('result-3')

    // Next call should trigger new execution
    await cached(4)
    expect(mockFn).toHaveBeenCalledTimes(4)
  })
})

describe('throttleQuery and cacheQuery combination', () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('should work with throttleQuery wrapping cacheQuery', async () => {
    const mockFn = jest.fn().mockImplementation(async _value => `result-${_value}`)
    const resolver = (_value: number) => 'default'
    const cached = cacheQuery(mockFn, 10, resolver)
    const throttled = throttleQuery(cached, 5, resolver)

    // First batch of calls
    const promise1 = throttled(1)
    const promise2 = throttled(2)
    const promise3 = throttled(3)

    // Should be throttled
    expect(mockFn).not.toHaveBeenCalled()

    // Advance time past throttle duration
    jest.advanceTimersByTime(6)

    // Should have made one call with the last value
    expect(mockFn).toHaveBeenCalledTimes(1)
    expect(mockFn).toHaveBeenCalledWith(3)

    // All promises should resolve with the same result
    const [result1, result2, result3] = await Promise.all([promise1, promise2, promise3])
    expect(result1).toBe('result-3')
    expect(result2).toBe('result-3')
    expect(result3).toBe('result-3')

    // Second batch of calls within cache TTL
    const promise4 = throttled(4)
    const promise5 = throttled(5)

    // Should be throttled
    expect(mockFn).toHaveBeenCalledTimes(1)

    // Advance time past throttle duration
    jest.advanceTimersByTime(6)

    // Should use cached result
    expect(mockFn).toHaveBeenCalledTimes(1)

    const [result4, result5] = await Promise.all([promise4, promise5])
    expect(result4).toBe('result-3')
    expect(result5).toBe('result-3')
  })

  it('should work with cacheQuery wrapping throttleQuery', async () => {
    const mockFn = jest.fn().mockImplementation(async _value => `result-${_value}`)
    const resolver = (_value: number) => 'default'
    const throttled = throttleQuery(mockFn, 5, resolver)
    const cached = cacheQuery(throttled, 10, resolver)

    // First batch of calls
    const promise1 = cached(1)
    const promise2 = cached(2)
    const promise3 = cached(3)

    // Should be throttled
    expect(mockFn).not.toHaveBeenCalled()

    // Advance time past throttle duration
    jest.advanceTimersByTime(6)

    // Should have made one call with the first value due to caching
    expect(mockFn).toHaveBeenCalledTimes(1)
    expect(mockFn).toHaveBeenCalledWith(1)

    // All promises should resolve with the same result
    const [result1, result2, result3] = await Promise.all([promise1, promise2, promise3])
    expect(result1).toBe('result-1')
    expect(result2).toBe('result-1')
    expect(result3).toBe('result-1')

    // Second batch of calls within cache TTL
    const promise4 = cached(4)
    const promise5 = cached(5)

    // Should use cached result immediately
    expect(mockFn).toHaveBeenCalledTimes(1)

    const [result4, result5] = await Promise.all([promise4, promise5])
    expect(result4).toBe('result-1')
    expect(result5).toBe('result-1')
  })

  it('should handle errors properly in combination', async () => {
    const error = new Error('Test error')
    const mockFn = jest.fn().mockImplementation(async (_value) => {
      throw error
    })
    const resolver = (_value: number) => 'default'
    const throttled = throttleQuery(mockFn, 5, resolver)
    const cached = cacheQuery(throttled, 10, resolver)

    // First batch of calls
    const promise1 = cached(1)
    const promise2 = cached(2)

    // Advance time past throttle duration
    jest.advanceTimersByTime(6)

    // All promises should reject with the same error
    await expect(promise1).rejects.toThrow(error)
    await expect(promise2).rejects.toThrow(error)

    // Second batch of calls within cache TTL
    const promise3 = cached(3)
    const promise4 = cached(4)

    // Should not be throttled or cached due to error
    expect(mockFn).toHaveBeenCalledTimes(1)

    // Advance time past throttle duration
    jest.advanceTimersByTime(6)

    // Should reject with the same error
    await expect(promise3).rejects.toThrow(error)
    await expect(promise4).rejects.toThrow(error)
  })
})
