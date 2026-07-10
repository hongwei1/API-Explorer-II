import { describe, it, expect, vi, beforeEach } from 'vitest'

// superagent's request builders are chainable and thenable (awaiting the
// chain resolves the request). Build a minimal mock with that same shape.
function makeRequest(resolution: { body: any } | { reject: any }) {
  const req: any = {
    set: vi.fn(() => req),
    send: vi.fn(() => req),
    then: (resolve: any, reject: any) =>
      'reject' in resolution ? Promise.reject(resolution.reject).catch(reject) : resolve(resolution)
  }
  return req
}

const mockGet = vi.fn()
const mockPost = vi.fn()
const mockPut = vi.fn()
const mockDelete = vi.fn()

vi.mock('superagent', () => ({
  default: {
    get: (...args: any[]) => mockGet(...args),
    post: (...args: any[]) => mockPost(...args),
    put: (...args: any[]) => mockPut(...args),
    delete: (...args: any[]) => mockDelete(...args)
  }
}))

const { get, create, isServerUp } = await import('@/obp/index')

describe('obp/index get()', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns the response body on success', async () => {
    mockGet.mockReturnValue(makeRequest({ body: { banks: [] } }))

    const result = await get('/obp/v5.1.0/banks')

    expect(result).toEqual({ banks: [] })
  })

  it('returns {error: response.body} instead of throwing, when the server responds with an error body', async () => {
    mockGet.mockReturnValue(
      makeRequest({ reject: { response: { body: { code: 401, message: 'not authorized' } } } })
    )

    const result = await get('/obp/v5.1.0/banks')

    expect(result).toEqual({ error: { code: 401, message: 'not authorized' } })
  })

  it('falls back to {error} when the failure has no response body (e.g. network error)', async () => {
    const networkError = new Error('network down')
    mockGet.mockReturnValue(makeRequest({ reject: networkError }))

    const result = await get('/obp/v5.1.0/banks')

    expect(result).toEqual({ error: networkError })
  })
})

describe('obp/index create()', () => {
  beforeEach(() => vi.clearAllMocks())

  it('sends a parsed JSON body when given a valid JSON string', async () => {
    const req = makeRequest({ body: { ok: true } })
    mockPost.mockReturnValue(req)

    await create('/obp/v5.1.0/banks', '{"name":"test bank"}')

    expect(req.send).toHaveBeenCalledWith({ name: 'test bank' })
  })

  it('silently omits the body when the string is not valid JSON, instead of throwing', async () => {
    const req = makeRequest({ body: { ok: true } })
    mockPost.mockReturnValue(req)

    const result = await create('/obp/v5.1.0/banks', 'not valid json{{{')

    expect(req.send).not.toHaveBeenCalled()
    expect(result).toEqual({ ok: true })
  })

  it('sends a plain object body as-is', async () => {
    const req = makeRequest({ body: { ok: true } })
    mockPost.mockReturnValue(req)

    await create('/obp/v5.1.0/banks', { name: 'test bank' })

    expect(req.send).toHaveBeenCalledWith({ name: 'test bank' })
  })
})

describe('isServerUp', () => {
  beforeEach(() => vi.clearAllMocks())

  it('is up when at least one status value is truthy', async () => {
    mockGet.mockReturnValue(makeRequest({ body: { obp: true, opey: false } }))

    await expect(isServerUp()).resolves.toBe(true)
  })

  it('is down only when every status value is falsy', async () => {
    mockGet.mockReturnValue(makeRequest({ body: { obp: false, opey: false } }))

    await expect(isServerUp()).resolves.toBe(false)
  })
})
