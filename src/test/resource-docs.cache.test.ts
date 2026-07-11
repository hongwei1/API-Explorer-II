import { describe, it, expect, vi, beforeEach } from 'vitest'

// Locks the core invariant from the startup-performance fix: the background
// re-warm message is posted ONLY on a cache hit. Posting before/without a
// successful cache read made a cold cache fetch everything twice via the
// worker echo - the original headline bug.

const mockGet = vi.fn()
const mockIsServerUp = vi.fn()
vi.mock('@/obp', () => ({
  get: (...args: any[]) => mockGet(...args),
  isServerUp: (...args: any[]) => mockIsServerUp(...args),
  OBP_API_DEFAULT_RESOURCE_DOC_VERSION: 'OBPv7.0.0'
}))

const mockGetOBPAPIVersions = vi.fn()
vi.mock('@/obp/api-version', () => ({
  getOBPAPIVersions: (...args: any[]) => mockGetOBPAPIVersions(...args)
}))

const { cache } = await import('@/obp/resource-docs')

function makeWorker() {
  return { postMessage: vi.fn() }
}

function makeCacheStorage() {
  return { put: vi.fn() }
}

const warmDocs = {
  'OBPv7.0.0': { resource_docs: [{ operation_id: 'op-1', tags: ['Bank'] }] }
}

describe('resource-docs cache() - warm path (cache hit)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('posts exactly one background-refresh message and returns the cached docs', async () => {
    const worker = makeWorker()
    const cachedResponse = { json: vi.fn().mockResolvedValue(warmDocs) }

    const result = await cache(makeCacheStorage(), cachedResponse, worker)

    expect(worker.postMessage).toHaveBeenCalledTimes(1)
    expect(worker.postMessage).toHaveBeenCalledWith('update-resource-docs')
    expect(result.resourceDocs).toEqual(warmDocs)
    // No network fetches on a warm hit - everything served from cache.
    expect(mockGet).not.toHaveBeenCalled()
  })
})

describe('resource-docs cache() - cold path (cache miss)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('rebuilds the cache WITHOUT posting the refresh message', async () => {
    const worker = makeWorker()
    const cacheStorage = makeCacheStorage()
    const cachedResponse = { json: vi.fn().mockRejectedValue(new Error('no cache entry')) }
    mockIsServerUp.mockResolvedValue(true)
    mockGetOBPAPIVersions.mockResolvedValue({
      scanned_api_versions: [
        { api_standard: 'OBP', api_short_version: 'v7.0.0', is_active: true },
        { api_standard: 'OBP', api_short_version: 'v3.0.0', is_active: false }
      ]
    })
    mockGet.mockResolvedValue({ resource_docs: [{ operation_id: 'op-1', tags: ['Bank'] }] })

    const result = await cache(cacheStorage, cachedResponse, worker)

    // The invariant this file exists for: a cold cache must NOT schedule a
    // background refresh, or the worker echo re-fetches everything again.
    expect(worker.postMessage).not.toHaveBeenCalled()
    // Only the active version was fetched (is_active filter).
    expect(mockGet).toHaveBeenCalledTimes(1)
    expect(String(mockGet.mock.calls[0][0])).toContain('OBPv7.0.0')
    // The rebuilt mapping was written back to Cache Storage once.
    expect(cacheStorage.put).toHaveBeenCalledTimes(1)
    expect(result.resourceDocs['OBPv7.0.0']).toBeDefined()
  })

  it('throws when the API server is down instead of rebuilding', async () => {
    const cachedResponse = { json: vi.fn().mockRejectedValue(new Error('no cache entry')) }
    mockIsServerUp.mockResolvedValue(false)

    await expect(cache(makeCacheStorage(), cachedResponse, makeWorker())).rejects.toThrow(
      'API Server is not responding.'
    )
    expect(mockGetOBPAPIVersions).not.toHaveBeenCalled()
  })

  it('throws when the rebuild yields no docs (e.g. invalid versions response)', async () => {
    const cachedResponse = { json: vi.fn().mockRejectedValue(new Error('no cache entry')) }
    mockIsServerUp.mockResolvedValue(true)
    // cacheDoc treats an invalid versions response as "skip caching" and
    // returns {} - cache() must then fail loudly rather than mount an app
    // with zero documentation.
    mockGetOBPAPIVersions.mockResolvedValue({ unexpected: 'shape' })

    await expect(cache(makeCacheStorage(), cachedResponse, makeWorker())).rejects.toThrow(
      'No resource documentation available'
    )
  })
})
