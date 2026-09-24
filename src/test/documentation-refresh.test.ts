import { describe, expect, it, vi } from 'vitest'

import {
  documentationCacheResponse,
  isDocumentationRefreshDue,
  scheduleDocumentationRefreshIfDue
} from '../obp/documentation-refresh'

describe('documentation refresh throttling', () => {
  it('does not refresh a recently written cache entry', () => {
    const now = Date.now()
    const cachedResponse = documentationCacheResponse({ docs: [] }, now)

    expect(isDocumentationRefreshDue(cachedResponse, now + 1000)).toBe(false)
  })

  it('refreshes expired and legacy cache entries', () => {
    const now = Date.now()
    const expired = documentationCacheResponse({ docs: [] }, now - 60 * 60 * 1000)
    const legacy = new Response(JSON.stringify({ docs: [] }))

    expect(isDocumentationRefreshDue(expired, now)).toBe(true)
    expect(isDocumentationRefreshDue(legacy, now)).toBe(true)
  })

  it('posts exactly one update only when the cache entry is due', () => {
    const worker = { postMessage: vi.fn() }
    const fresh = documentationCacheResponse({ docs: [] })
    const legacy = new Response(JSON.stringify({ docs: [] }))

    expect(scheduleDocumentationRefreshIfDue(fresh, worker, 'refresh')).toBe(false)
    expect(scheduleDocumentationRefreshIfDue(legacy, worker, 'refresh')).toBe(true)
    expect(worker.postMessage).toHaveBeenCalledTimes(1)
    expect(worker.postMessage).toHaveBeenCalledWith('refresh')
  })
})
