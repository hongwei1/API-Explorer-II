import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { Container } from 'typedi'
import { OAuth2ProviderFactory } from '../services/OAuth2ProviderFactory.js'
import { OAuth2ProviderManager } from '../services/OAuth2ProviderManager.js'
import OBPClientService from '../services/OBPClientService.js'

const validDiscoveryDoc = {
  issuer: 'https://idp.test',
  authorization_endpoint: 'https://idp.test/authorize',
  token_endpoint: 'https://idp.test/token',
  userinfo_endpoint: 'https://idp.test/userinfo'
}

// Factory strategies are frozen at construction from env vars, so each test
// sets env first and constructs a fresh instance (not the Container singleton).
describe('OAuth2ProviderFactory', () => {
  const envKeys = ['VITE_OBP_OIDC_CLIENT_ID', 'VITE_OBP_OIDC_CLIENT_SECRET']
  const saved: Record<string, string | undefined> = {}

  beforeEach(() => {
    vi.clearAllMocks()
    for (const key of envKeys) {
      saved[key] = process.env[key]
      delete process.env[key]
    }
  })

  afterEach(() => {
    for (const key of envKeys) {
      if (saved[key] === undefined) delete process.env[key]
      else process.env[key] = saved[key]
    }
  })

  it('loads no strategies when no provider env vars are set', () => {
    const factory = new OAuth2ProviderFactory()
    expect(factory.getStrategyCount()).toBe(0)
    expect(factory.hasStrategy('obp-oidc')).toBe(false)
  })

  it('loads a strategy from env and reports it as configured', () => {
    process.env.VITE_OBP_OIDC_CLIENT_ID = 'test-client'
    process.env.VITE_OBP_OIDC_CLIENT_SECRET = 'test-secret'

    const factory = new OAuth2ProviderFactory()

    expect(factory.hasStrategy('obp-oidc')).toBe(true)
    expect(factory.getConfiguredProviders()).toEqual(['obp-oidc'])
  })

  it('initializeProvider returns null for a provider with no strategy', async () => {
    const factory = new OAuth2ProviderFactory()

    const client = await factory.initializeProvider({
      provider: 'obp-oidc',
      url: 'https://idp.test/.well-known'
    })

    expect(client).toBeNull()
  })

  it('initializeProvider returns an initialized client when discovery succeeds', async () => {
    process.env.VITE_OBP_OIDC_CLIENT_ID = 'test-client'
    process.env.VITE_OBP_OIDC_CLIENT_SECRET = 'test-secret'
    global.fetch = vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify(validDiscoveryDoc), { status: 200 }))
    ) as any

    const factory = new OAuth2ProviderFactory()
    const client = await factory.initializeProvider({
      provider: 'obp-oidc',
      url: 'https://idp.test/.well-known'
    })

    expect(client).not.toBeNull()
    expect(client!.isInitialized()).toBe(true)
  })

  it('initializeProvider returns null (not a throw) when discovery fails', async () => {
    process.env.VITE_OBP_OIDC_CLIENT_ID = 'test-client'
    process.env.VITE_OBP_OIDC_CLIENT_SECRET = 'test-secret'
    global.fetch = vi.fn(() => Promise.reject(new Error('connection refused'))) as any

    const factory = new OAuth2ProviderFactory()
    const client = await factory.initializeProvider({
      provider: 'obp-oidc',
      url: 'https://unreachable.test/.well-known'
    })

    expect(client).toBeNull()
  })
})

// Manager decision logic only - the timer-driven retry/health-check loops are
// deliberately out of scope (they'd need fake timers and add little value).
describe('OAuth2ProviderManager.initializeProviders decisions', () => {
  let mockFactory: any
  let mockObpClient: any
  let manager: OAuth2ProviderManager

  function makeManager(wellKnownUris: any[], hasStrategy: (name: string) => boolean, initResult: any) {
    mockFactory = {
      hasStrategy: vi.fn(hasStrategy),
      initializeProvider: vi.fn().mockResolvedValue(initResult)
    }
    mockObpClient = {
      getOBPClientConfig: vi.fn(() => ({ baseUri: 'http://obp.test:8080' })),
      get: vi.fn().mockResolvedValue({ well_known_uris: wellKnownUris })
    }
    Container.set(OAuth2ProviderFactory, mockFactory)
    Container.set(OBPClientService, mockObpClient)
    manager = new OAuth2ProviderManager()
    return manager
  }

  afterEach(() => {
    // Never leave a retry interval running across tests.
    manager?.stopRetryInterval()
    manager?.stopHealthCheck()
  })

  it('initializes configured providers and skips unconfigured ones without retrying them', async () => {
    const initializedClient = { isInitialized: () => true }
    makeManager(
      [
        { provider: 'keycloak', url: 'https://kc.test/.well-known' },
        { provider: 'google', url: 'https://google.test/.well-known' }
      ],
      (name) => name === 'keycloak',
      initializedClient
    )
    const retrySpy = vi.spyOn(manager, 'startRetryInterval')

    const success = await manager.initializeProviders()

    expect(success).toBe(true)
    expect(manager.getAvailableProviders()).toEqual(['keycloak'])
    // google is marked unconfigured, and only keycloak was ever attempted
    expect(mockFactory.initializeProvider).toHaveBeenCalledTimes(1)
    expect(manager.getProviderStatus('google')).toMatchObject({
      available: false,
      configured: false
    })
    // All configured providers succeeded - no retry loop should start.
    expect(retrySpy).not.toHaveBeenCalled()
  })

  it('does not start the retry loop when NO advertised provider is configured locally', async () => {
    makeManager(
      [{ provider: 'keycloak', url: 'https://kc.test/.well-known' }],
      () => false,
      null
    )
    const retrySpy = vi.spyOn(manager, 'startRetryInterval')

    const success = await manager.initializeProviders()

    expect(success).toBe(false)
    // Strategies are read once from env at startup; retrying can never fix
    // a missing local configuration, so the manager must not spin.
    expect(retrySpy).not.toHaveBeenCalled()
  })

  it('starts the retry loop when a configured provider fails to initialize', async () => {
    makeManager(
      [{ provider: 'keycloak', url: 'https://kc.test/.well-known' }],
      () => true,
      null // factory returns null = init failed (e.g. IdP down)
    )
    const retrySpy = vi.spyOn(manager, 'startRetryInterval')

    const success = await manager.initializeProviders()

    expect(success).toBe(false)
    expect(retrySpy).toHaveBeenCalled()
  })

  it('fetchWellKnownUris uses the legacy env var without calling the OBP API', async () => {
    const savedLegacy = process.env.VITE_OBP_OAUTH2_WELL_KNOWN_URL
    process.env.VITE_OBP_OAUTH2_WELL_KNOWN_URL = 'https://legacy.test/.well-known'
    try {
      makeManager([], () => false, null)

      const uris = await manager.fetchWellKnownUris()

      expect(uris).toEqual([{ provider: 'obp-oidc', url: 'https://legacy.test/.well-known' }])
      expect(mockObpClient.get).not.toHaveBeenCalled()
    } finally {
      if (savedLegacy === undefined) delete process.env.VITE_OBP_OAUTH2_WELL_KNOWN_URL
      else process.env.VITE_OBP_OAUTH2_WELL_KNOWN_URL = savedLegacy
    }
  })
})
