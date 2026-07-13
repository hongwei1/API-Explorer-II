import { describe, it, expect, beforeEach, vi } from 'vitest'
import { OAuth2ClientWithConfig } from '../services/OAuth2ClientWithConfig.js'

// The OIDC client is the heart of the login flow and had zero coverage:
// discovery-document validation, token exchange, and token refresh.

const validDiscoveryDoc = {
  issuer: 'https://idp.test',
  authorization_endpoint: 'https://idp.test/authorize',
  token_endpoint: 'https://idp.test/token',
  userinfo_endpoint: 'https://idp.test/userinfo',
  end_session_endpoint: 'https://idp.test/logout'
}

function makeClient() {
  return new OAuth2ClientWithConfig(
    'test-client-id',
    'test-client-secret',
    'http://localhost:5173/api/oauth2/callback',
    'test-provider'
  )
}

function mockFetchJson(body: any, status = 200) {
  global.fetch = vi.fn(() =>
    Promise.resolve(new Response(typeof body === 'string' ? body : JSON.stringify(body), { status }))
  ) as any
}

describe('OAuth2ClientWithConfig.initOIDCConfig', () => {
  beforeEach(() => vi.clearAllMocks())

  it('loads a valid discovery document and exposes its endpoints', async () => {
    mockFetchJson(validDiscoveryDoc)
    const client = makeClient()

    await client.initOIDCConfig('https://idp.test/.well-known/openid-configuration')

    expect(client.isInitialized()).toBe(true)
    expect(client.getAuthorizationEndpoint()).toBe('https://idp.test/authorize')
    expect(client.getTokenEndpoint()).toBe('https://idp.test/token')
    expect(client.getUserInfoEndpoint()).toBe('https://idp.test/userinfo')
    expect(client.getEndSessionEndpoint()).toBe('https://idp.test/logout')
    expect(client.wellKnownUri).toBe('https://idp.test/.well-known/openid-configuration')
  })

  it('throws on a non-ok discovery response', async () => {
    mockFetchJson('not found', 404)
    const client = makeClient()

    await expect(client.initOIDCConfig('https://idp.test/.well-known')).rejects.toThrow(
      'Failed to fetch OIDC configuration'
    )
    expect(client.isInitialized()).toBe(false)
  })

  it('throws when the discovery response is not valid JSON', async () => {
    mockFetchJson('<html>login page</html>')
    const client = makeClient()

    await expect(client.initOIDCConfig('https://idp.test/.well-known')).rejects.toThrow(
      'Invalid JSON response'
    )
  })

  it.each(['authorization_endpoint', 'token_endpoint', 'userinfo_endpoint'])(
    'throws when the discovery document is missing %s',
    async (missingField) => {
      const doc: any = { ...validDiscoveryDoc }
      delete doc[missingField]
      mockFetchJson(doc)
      const client = makeClient()

      await expect(client.initOIDCConfig('https://idp.test/.well-known')).rejects.toThrow(
        `missing ${missingField}`
      )
      expect(client.isInitialized()).toBe(false)
    }
  )

  it('endpoint getters throw before initialization', () => {
    const client = makeClient()
    expect(() => client.getAuthorizationEndpoint()).toThrow('not initialized')
    expect(() => client.getTokenEndpoint()).toThrow('not initialized')
    expect(() => client.getUserInfoEndpoint()).toThrow('not initialized')
    // End-session is optional, so it returns undefined instead of throwing.
    expect(client.getEndSessionEndpoint()).toBeUndefined()
  })
})

describe('OAuth2ClientWithConfig.exchangeAuthorizationCode', () => {
  let client: OAuth2ClientWithConfig

  beforeEach(async () => {
    vi.clearAllMocks()
    mockFetchJson(validDiscoveryDoc)
    client = makeClient()
    await client.initOIDCConfig('https://idp.test/.well-known')
  })

  it('sends the code+verifier with Basic auth and maps the token response', async () => {
    mockFetchJson({
      access_token: 'access-token-value',
      refresh_token: 'refresh-token-value',
      id_token: 'id-token-value',
      expires_in: 3600,
      scope: 'openid'
    })

    const tokens = await client.exchangeAuthorizationCode('auth-code', 'pkce-verifier')

    expect(tokens).toMatchObject({
      accessToken: 'access-token-value',
      refreshToken: 'refresh-token-value',
      idToken: 'id-token-value',
      tokenType: 'Bearer', // defaulted when the provider omits token_type
      expiresIn: 3600
    })

    const [url, options] = (global.fetch as any).mock.calls[0]
    expect(url).toBe('https://idp.test/token')
    expect(options.headers.Authorization).toMatch(/^Basic /)
    const body = new URLSearchParams(options.body)
    expect(body.get('grant_type')).toBe('authorization_code')
    expect(body.get('code')).toBe('auth-code')
    expect(body.get('code_verifier')).toBe('pkce-verifier')
    expect(body.get('client_id')).toBe('test-client-id')
  })

  it('throws when the token endpoint rejects the exchange', async () => {
    mockFetchJson('invalid_grant', 400)

    await expect(client.exchangeAuthorizationCode('bad-code', 'verifier')).rejects.toThrow(
      'Token exchange failed'
    )
  })
})

describe('OAuth2ClientWithConfig.refreshTokens', () => {
  let client: OAuth2ClientWithConfig

  beforeEach(async () => {
    vi.clearAllMocks()
    mockFetchJson(validDiscoveryDoc)
    client = makeClient()
    await client.initOIDCConfig('https://idp.test/.well-known')
  })

  it('keeps the old refresh token when the provider does not return a new one', async () => {
    mockFetchJson({ access_token: 'new-access-token' })

    const tokens = await client.refreshTokens('old-refresh-token')

    expect(tokens.accessToken).toBe('new-access-token')
    expect(tokens.refreshToken).toBe('old-refresh-token')
  })

  it('throws when the refresh fails', async () => {
    mockFetchJson('invalid_grant', 400)

    await expect(client.refreshTokens('expired-refresh-token')).rejects.toThrow(
      'Token refresh failed'
    )
  })
})
