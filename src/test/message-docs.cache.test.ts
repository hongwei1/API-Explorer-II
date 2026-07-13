import { describe, it, expect, vi, beforeEach } from 'vitest'

// Same invariant as resource-docs.cache.test.ts, for the two message-docs
// cache entry points: the background-refresh message is posted only on a
// cache hit; a cold cache rebuilds without posting.

const mockGet = vi.fn()
const mockIsServerUp = vi.fn()
vi.mock('@/obp', () => ({
  get: (...args: any[]) => mockGet(...args),
  isServerUp: (...args: any[]) => mockIsServerUp(...args),
  OBP_API_VERSION: 'v5.1.0'
}))

const { cache, cacheJsonSchema } = await import('@/obp/message-docs')

function makeWorker() {
  return { postMessage: vi.fn() }
}

function makeCacheStorage() {
  return { put: vi.fn() }
}

// getConnectors' in-flight dedup plus per-connector fetches all go through
// the same get() mock - dispatch on the path.
function mockColdBackend() {
  mockGet.mockImplementation((path: string) => {
    if (path.includes('/system/connectors')) {
      return Promise.resolve({ connectors: [{ connector_name: 'rest_vMar2019' }] })
    }
    if (path.includes('/json-schema')) {
      return Promise.resolve({ properties: {}, definitions: { InBoundX: {} } })
    }
    return Promise.resolve({
      message_docs: [{ process: 'x', adapter_implementation: { group: 'Bank' } }]
    })
  })
}

describe('message-docs cache() - warm vs cold', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('warm hit: posts exactly one update-message-docs and fetches nothing', async () => {
    const worker = makeWorker()
    const cachedResponse = { json: vi.fn().mockResolvedValue({ rest_vMar2019: {} }) }

    const result = await cache(makeCacheStorage(), cachedResponse, worker)

    expect(worker.postMessage).toHaveBeenCalledTimes(1)
    expect(worker.postMessage).toHaveBeenCalledWith('update-message-docs')
    expect(result).toEqual({ rest_vMar2019: {} })
    expect(mockGet).not.toHaveBeenCalled()
  })

  it('cold miss: rebuilds via the API without posting any refresh message', async () => {
    const worker = makeWorker()
    const cacheStorage = makeCacheStorage()
    const cachedResponse = { json: vi.fn().mockRejectedValue(new Error('no cache entry')) }
    mockIsServerUp.mockResolvedValue(true)
    mockColdBackend()

    const result = await cache(cacheStorage, cachedResponse, worker)

    expect(worker.postMessage).not.toHaveBeenCalled()
    expect(cacheStorage.put).toHaveBeenCalledTimes(1)
    expect(result.rest_vMar2019).toBeDefined()
  })

  it('cold miss with the server down: throws instead of rebuilding', async () => {
    const cachedResponse = { json: vi.fn().mockRejectedValue(new Error('no cache entry')) }
    mockIsServerUp.mockResolvedValue(false)

    await expect(cache(makeCacheStorage(), cachedResponse, makeWorker())).rejects.toThrow(
      'API Server is not responding.'
    )
  })
})

describe('message-docs cacheJsonSchema() - warm vs cold', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('warm hit: posts exactly one update-message-docs-json-schema', async () => {
    const worker = makeWorker()
    const cachedResponse = { json: vi.fn().mockResolvedValue({ rest_vMar2019: {} }) }

    const result = await cacheJsonSchema(makeCacheStorage(), cachedResponse, worker)

    expect(worker.postMessage).toHaveBeenCalledTimes(1)
    expect(worker.postMessage).toHaveBeenCalledWith('update-message-docs-json-schema')
    expect(result).toEqual({ rest_vMar2019: {} })
  })

  it('cold miss: rebuilds without posting', async () => {
    const worker = makeWorker()
    const cacheStorage = makeCacheStorage()
    const cachedResponse = { json: vi.fn().mockRejectedValue(new Error('no cache entry')) }
    mockIsServerUp.mockResolvedValue(true)
    mockColdBackend()

    const result = await cacheJsonSchema(cacheStorage, cachedResponse, worker)

    expect(worker.postMessage).not.toHaveBeenCalled()
    expect(cacheStorage.put).toHaveBeenCalledTimes(1)
    expect(result.rest_vMar2019).toBeDefined()
  })
})
