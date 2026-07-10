import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Container } from 'typedi'
import OBPClientService from '../services/OBPClientService.js'
import { BerlinGroupSignatureService } from '../services/BerlinGroupSignatureService.js'

// OBPClientService routes every request down one of three paths: Berlin Group
// signed (when the path matches and signing is enabled), Bearer-authenticated,
// or unauthenticated (GET only - mutations must throw). These tests pin that
// routing plus the OBPAPIError contract (status + raw body) that
// sendOBPError in routes/obp.ts depends on.

const bearerConfig = {
  baseUri: 'https://test.openbankproject.com',
  version: 'v5.1.0',
  oauth2: { accessToken: 'test-access-token', tokenType: 'Bearer' }
}

function mockFetchOnce(body: any, init: { status?: number } = {}) {
  const status = init.status ?? 200
  global.fetch = vi.fn(() =>
    Promise.resolve(
      new Response(typeof body === 'string' ? body : JSON.stringify(body), { status })
    )
  ) as any
}

describe('OBPClientService request routing', () => {
  let obpClientService: OBPClientService

  beforeEach(() => {
    vi.clearAllMocks()
    // Default: Berlin Group signing disabled so requests take the plain path.
    Container.set(BerlinGroupSignatureService, {
      isEnabled: () => false,
      generateHeaders: vi.fn()
    })
    obpClientService = new OBPClientService()
  })

  it('GET without a token makes an unauthenticated request', async () => {
    mockFetchOnce({ ok: true })

    const result = await obpClientService.get('/obp/v5.1.0/banks', null)

    expect(result).toEqual({ ok: true })
    const [, options] = (global.fetch as any).mock.calls[0]
    expect(options.headers).not.toHaveProperty('Authorization')
  })

  it('GET with a token sends the Bearer header', async () => {
    mockFetchOnce({ ok: true })

    await obpClientService.get('/obp/v5.1.0/banks', bearerConfig)

    const [, options] = (global.fetch as any).mock.calls[0]
    expect(options.headers.Authorization).toBe('Bearer test-access-token')
  })

  it.each([
    ['create', (svc: OBPClientService) => svc.create('/obp/v5.1.0/banks', {}, null)],
    ['update', (svc: OBPClientService) => svc.update('/obp/v5.1.0/banks', {}, null)],
    ['discard', (svc: OBPClientService) => svc.discard('/obp/v5.1.0/banks', null)]
  ])('%s without a token throws instead of calling OBP', async (_name, call) => {
    global.fetch = vi.fn() as any

    await expect(call(obpClientService)).rejects.toThrow('Authentication required')
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('routes Berlin Group paths through the signing branch when enabled', async () => {
    const generateHeaders = vi.fn(() => ({ 'X-Request-ID': 'test-request-id' }))
    Container.set(BerlinGroupSignatureService, {
      isEnabled: () => true,
      generateHeaders
    })
    obpClientService = new OBPClientService()
    mockFetchOnce({ ok: true })

    await obpClientService.get('/berlin-group/v1.3/accounts', {
      ...bearerConfig,
      berlinGroup: { consentId: 'test-consent' }
    })

    expect(generateHeaders).toHaveBeenCalledWith('GET', '', 'test-consent')
    const [, options] = (global.fetch as any).mock.calls[0]
    expect(options.headers['X-Request-ID']).toBe('test-request-id')
    // Bearer token still rides along with the signature headers
    expect(options.headers.Authorization).toBe('Bearer test-access-token')
  })
})

describe('OBPClientService error contract (OBPAPIError)', () => {
  let obpClientService: OBPClientService

  beforeEach(() => {
    vi.clearAllMocks()
    Container.set(BerlinGroupSignatureService, {
      isEnabled: () => false,
      generateHeaders: vi.fn()
    })
    obpClientService = new OBPClientService()
  })

  it('carries the HTTP status and the raw OBP error body', async () => {
    const obpErrorBody = '{"code":401,"message":"OBP-20217: Consumer is disabled."}'
    mockFetchOnce(obpErrorBody, { status: 401 })

    await expect(obpClientService.get('/obp/v5.1.0/banks', null)).rejects.toMatchObject({
      name: 'OBPAPIError',
      status: 401,
      // message must be the untouched body - sendOBPError re-parses it to
      // forward OBP errors verbatim to the client.
      message: obpErrorBody
    })
  })

  it('mutation errors preserve the status code too', async () => {
    mockFetchOnce('backend exploded', { status: 500 })

    await expect(
      obpClientService.create('/obp/v5.1.0/banks', {}, bearerConfig)
    ).rejects.toMatchObject({ status: 500, message: 'backend exploded' })
  })
})
