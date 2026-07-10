import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Container } from 'typedi'
import express from 'express'
import request from 'supertest'
import { OAuth2ProviderManager } from '../services/OAuth2ProviderManager.js'

// OAuth2ProviderManager must be registered in the container before oauth2.ts
// is imported: the router module does Container.get(OAuth2ProviderManager) at
// load time.
const mockExchangeAuthorizationCode = vi.fn()
const mockClient = {
  clientId: 'test-client-id',
  getAuthorizationEndpoint: () => 'https://idp.test/authorize',
  getRedirectUri: () => 'http://localhost:5173/api/oauth2/callback',
  getUserInfoEndpoint: () => 'https://idp.test/userinfo',
  exchangeAuthorizationCode: mockExchangeAuthorizationCode
}

Container.set(OAuth2ProviderManager, {
  getProvider: vi.fn((name: string) => (name === 'test-provider' ? mockClient : undefined)),
  getAvailableProviders: vi.fn(() => ['test-provider']),
  getProviderStatus: vi.fn(() => ({ available: true }))
})

const oauth2Router = (await import('../routes/oauth2.js')).default

// A minimal stand-in for express-session: attaches a plain mutable object as
// req.session instead of pulling in the real cookie/store machinery, so tests
// can assert on session contents directly.
function buildApp(sessionData: Record<string, any>) {
  const app = express()
  app.use((req: any, _res, next) => {
    req.session = sessionData
    req.session.save = (cb: (err?: any) => void) => cb()
    next()
  })
  app.use('/api', oauth2Router)
  return app
}

function mockUserInfoFetch(userInfo: any) {
  global.fetch = vi.fn(() =>
    Promise.resolve(new Response(JSON.stringify(userInfo), { status: 200 }))
  ) as any
}

const validCallbackSession = () => ({
  oauth2_state: 'valid-state',
  oauth2_code_verifier: 'valid-verifier',
  oauth2_provider: 'test-provider'
})

describe('GET /oauth2/callback - CSRF and parameter validation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('redirects with invalid_state and does not exchange the code when state does not match', async () => {
    const session = validCallbackSession()
    const app = buildApp(session)

    const res = await request(app).get('/api/oauth2/callback?code=abc&state=wrong-state')

    expect(res.status).toBe(302)
    expect(res.headers.location).toContain('oauth2_error=invalid_state')
    expect(mockExchangeAuthorizationCode).not.toHaveBeenCalled()
  })

  it('redirects with missing_code when no code is present', async () => {
    const app = buildApp(validCallbackSession())

    const res = await request(app).get('/api/oauth2/callback?state=valid-state')

    expect(res.headers.location).toContain('oauth2_error=missing_code')
  })

  it('redirects with missing_state when no state is present', async () => {
    const app = buildApp(validCallbackSession())

    const res = await request(app).get('/api/oauth2/callback?code=abc')

    expect(res.headers.location).toContain('oauth2_error=missing_state')
  })
})

describe('GET /oauth2/callback - JWT-vs-opaque access token selection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUserInfoFetch({ sub: 'user-1', email: 'user@example.com' })
  })

  it('uses the access token when it is a JWT (three dot-separated segments)', async () => {
    mockExchangeAuthorizationCode.mockResolvedValue({
      accessToken: 'header.payload.signature',
      refreshToken: 'refresh-token',
      idToken: 'id-token'
    })
    const session = validCallbackSession()
    const app = buildApp(session)

    await request(app).get('/api/oauth2/callback?code=abc&state=valid-state')

    expect(session.clientConfig.oauth2.accessToken).toBe('header.payload.signature')
  })

  it('falls back to the id_token when the access token is opaque (e.g. Google ya29...)', async () => {
    mockExchangeAuthorizationCode.mockResolvedValue({
      accessToken: 'ya29.opaque-google-token-not-a-jwt',
      refreshToken: 'refresh-token',
      idToken: 'header.payload.signature'
    })
    const session = validCallbackSession()
    const app = buildApp(session)

    await request(app).get('/api/oauth2/callback?code=abc&state=valid-state')

    expect(session.clientConfig.oauth2.accessToken).toBe('header.payload.signature')
  })

  it('populates baseUri/version on session.clientConfig from env, needed by OBPConsentsService', async () => {
    mockExchangeAuthorizationCode.mockResolvedValue({
      accessToken: 'header.payload.signature',
      refreshToken: 'refresh-token',
      idToken: 'id-token'
    })
    const session = validCallbackSession()
    const app = buildApp(session)

    await request(app).get('/api/oauth2/callback?code=abc&state=valid-state')

    expect(session.clientConfig.baseUri).toBe(process.env.VITE_OBP_API_HOST)
    expect(session.clientConfig.version).toBe(process.env.VITE_OBP_API_VERSION)
  })
})
