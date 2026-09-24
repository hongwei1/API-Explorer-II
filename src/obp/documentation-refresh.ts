const DEFAULT_REFRESH_MIN_AGE_MS = 60 * 60 * 1000
const WRITTEN_AT_HEADER = 'x-obp-cache-written-at'

function refreshMinAgeMs(): number {
  const configured = Number(import.meta.env.VITE_DOCS_REFRESH_MIN_AGE_MS)
  return Number.isFinite(configured) && configured >= 0
    ? configured
    : DEFAULT_REFRESH_MIN_AGE_MS
}

export function isDocumentationRefreshDue(
  cachedResponse: Pick<Response, 'headers'>,
  now: number = Date.now()
): boolean {
  const writtenAt = Number(cachedResponse.headers.get(WRITTEN_AT_HEADER))
  return !Number.isFinite(writtenAt) || now - writtenAt >= refreshMinAgeMs()
}

export function documentationCacheResponse(value: unknown, now: number = Date.now()): Response {
  return new Response(JSON.stringify(value), {
    headers: {
      'content-type': 'application/json',
      [WRITTEN_AT_HEADER]: String(now)
    }
  })
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
