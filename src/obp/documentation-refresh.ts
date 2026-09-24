const DEFAULT_REFRESH_MIN_AGE_MS = 60 * 60 * 1000
const WRITTEN_AT_HEADER = 'x-obp-cache-written-at'

function refreshMinAgeMs(): number {
  const raw = import.meta.env.VITE_DOCS_REFRESH_MIN_AGE_MS
  // An empty value (`VITE_DOCS_REFRESH_MIN_AGE_MS=`) is "not set", not zero.
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return DEFAULT_REFRESH_MIN_AGE_MS
  }
  const configured = Number(raw)
  return Number.isFinite(configured) && configured >= 0 ? configured : DEFAULT_REFRESH_MIN_AGE_MS
}

export function isDocumentationRefreshDue(
  cachedResponse: Pick<Response, 'headers'>,
  now: number = Date.now()
): boolean {
  const header = cachedResponse.headers.get(WRITTEN_AT_HEADER)
  // No stamp: a legacy entry, or one written from an incomplete load. Refresh it.
  if (header === null || header.trim() === '') return true
  const writtenAt = Number(header)
  // An unreadable stamp, or one in the future (the clock was set back), must not keep the entry
  // from ever refreshing.
  if (!Number.isFinite(writtenAt) || writtenAt > now) return true
  return now - writtenAt >= refreshMinAgeMs()
}

/**
 * Wrap a value for the documentation cache. Only a complete load is stamped. An entry written
 * from a partial load carries no stamp, so the next page load refreshes it instead of keeping the
 * gaps for the whole minimum age.
 */
export function documentationCacheResponse(
  value: unknown,
  now: number = Date.now(),
  complete: boolean = true
): Response {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (complete) headers[WRITTEN_AT_HEADER] = String(now)
  return new Response(JSON.stringify(value), { headers })
}

export function scheduleDocumentationRefreshIfDue(
  cachedResponse: Pick<Response, 'headers'>,
  worker: Pick<Worker, 'postMessage'>,
  event: string
): boolean {
  if (!isDocumentationRefreshDue(cachedResponse)) {
    return false
  }

  worker.postMessage(event)
  return true
}

/**
 * Store a loaded documentation set. Nothing is written when nothing loaded, so a failed refresh
 * cannot replace a good cache entry with an empty one. A partial load is written without a
 * timestamp so the next page load refreshes it.
 */
export async function putDocumentationCache(
  cacheStorage: any,
  value: any,
  complete: boolean,
  what: string
): Promise<void> {
  if (Object.keys(value).length === 0) {
    console.warn(`[CACHE] No ${what} were loaded; leaving the existing cache entry untouched`)
    return
  }
  await cacheStorage.put('/', documentationCacheResponse(value, Date.now(), complete))
}
