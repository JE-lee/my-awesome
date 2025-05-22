import { retryAsync, retryAsyncUtil, timeout } from './retry'

describe('retryAsync', () => {
  it('should return result if function succeeds on first try', async () => {
    const mockFn = jest.fn().mockResolvedValue('success')
    const retried = retryAsync(mockFn, 3)

    const result = await retried()

    expect(result).toBe('success')
    expect(mockFn).toHaveBeenCalledTimes(1)
  })

  it('should retry function the specified number of times on failure', async () => {
    const mockFn = jest.fn()
      .mockRejectedValueOnce(new Error('fail 1'))
      .mockRejectedValueOnce(new Error('fail 2'))
      .mockResolvedValue('success')

    const retried = retryAsync(mockFn, 3)

    const result = await retried()

    expect(result).toBe('success')
    expect(mockFn).toHaveBeenCalledTimes(3)
  })

  it('should throw error if all retries fail', async () => {
    const error = new Error('test error')
    const mockFn = jest.fn().mockRejectedValue(error)
    const retried = retryAsync(mockFn, 2)

    await expect(retried()).rejects.toThrow(error)
    expect(mockFn).toHaveBeenCalledTimes(3) // Initial + 2 retries
  })

  it('should pass arguments to the function correctly', async () => {
    const mockFn = jest.fn().mockResolvedValue('success')
    const retried = retryAsync(mockFn, 3)

    await retried('arg1', 'arg2')

    expect(mockFn).toHaveBeenCalledWith('arg1', 'arg2')
  })

  it('should preserve this context', async () => {
    const context = { value: 'test' }
    const mockFn = jest.fn(function (this: typeof context) {
      return Promise.resolve(this.value)
    })

    const retried = retryAsync(mockFn, 3)

    const result = await retried.call(context)

    expect(result).toBe('test')
  })
})

describe('timeout', () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('should resolve with function result if within timeout', async () => {
    const mockFn = jest.fn().mockResolvedValue('success')
    const withTimeout = timeout(mockFn, 1000)

    const promise = withTimeout()

    jest.advanceTimersByTime(500) // Function completes before timeout

    const result = await promise
    expect(result).toBe('success')
    expect(mockFn).toHaveBeenCalledTimes(1)
  })

  it('should reject with timeout error if function takes too long', async () => {
    // Create a function that never resolves
    const mockFn = jest.fn().mockImplementation(() => new Promise(() => {}))
    const withTimeout = timeout(mockFn, 1000)

    const promise = withTimeout()

    // Advance timer beyond timeout
    jest.advanceTimersByTime(1001)

    await expect(promise).rejects.toThrow('timeout')
    expect(mockFn).toHaveBeenCalledTimes(1)
  })

  it('should pass arguments to the function correctly', async () => {
    const mockFn = jest.fn().mockResolvedValue('success')
    const withTimeout = timeout(mockFn, 1000)

    await withTimeout('arg1', 'arg2')

    expect(mockFn).toHaveBeenCalledWith('arg1', 'arg2')
  })

  it('should preserve this context', async () => {
    const context = { value: 'test' }
    const mockFn = jest.fn(function (this: typeof context) {
      return Promise.resolve(this.value)
    })

    const withTimeout = timeout(mockFn, 1000)

    const result = await withTimeout.call(context)

    expect(result).toBe('test')
  })

  it('should return original function if timeout is negative', async () => {
    const mockFn = jest.fn().mockResolvedValue('success')
    const withTimeout = timeout(mockFn, -1)

    const result = await withTimeout()

    expect(result).toBe('success')
    expect(mockFn).toHaveBeenCalledTimes(1)
    // No race with timeout should have been created
  })
})

describe('retryAsyncUtil', () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('should combine retry and timeout functionality', async () => {
    const mockFn = jest.fn()
      .mockRejectedValueOnce(new Error('fail 1'))
      .mockResolvedValue('success')

    const retryWithTimeout = retryAsyncUtil(mockFn, 2, 1000)

    const promise = retryWithTimeout()

    // Allow retry to happen
    await Promise.resolve()

    jest.advanceTimersByTime(500) // Function completes before timeout

    const result = await promise
    expect(result).toBe('success')
    expect(mockFn).toHaveBeenCalledTimes(2)
  })

  it('should reject with timeout error if all attempts take too long', async () => {
    // Create a function that never resolves
    const mockFn = jest.fn().mockImplementation(() => new Promise(() => {}))
    const retryWithTimeout = retryAsyncUtil(mockFn, 2, 1000)

    const promise = retryWithTimeout()

    // Advance timer beyond timeout
    jest.advanceTimersByTime(1001)

    await expect(promise).rejects.toThrow('timeout')
    expect(mockFn).toHaveBeenCalledTimes(1)
  })

  it('should use original function if overtime is negative', async () => {
    const mockFn = jest.fn()
      .mockRejectedValueOnce(new Error('fail 1'))
      .mockResolvedValue('success')

    const retryOnly = retryAsyncUtil(mockFn, 1, -1)

    const result = await retryOnly()

    expect(result).toBe('success')
    expect(mockFn).toHaveBeenCalledTimes(2)
  })
})
