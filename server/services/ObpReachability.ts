/**
 * Cheap "is the OBP API reachable" probe.
 *
 * The Explorer front end asks this at start-up and whenever a documentation cache is cold, so
 * it must stay light: a single request to the OBP API root endpoint, which needs no login and
 * is exempt from rate limiting by default. It deliberately does not fetch resource docs or
 * message docs the way /api/status does.
 */
export interface ObpGetter {
  get(path: string, oauthConfig: any): Promise<any>
}

function isErrorResponse(response: any): boolean {
  if (!response || typeof response !== 'object' || Object.keys(response).length === 0) return true
  return 'code' in response && Number(response.code) >= 400
}

export async function isObpReachable(client: ObpGetter, version: string): Promise<boolean> {
  try {
    return !isErrorResponse(await client.get(`/obp/${version}/root`, null))
  } catch {
    return false
  }
}
