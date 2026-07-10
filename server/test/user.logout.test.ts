import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { Container } from 'typedi'
import { OAuth2ProviderManager } from '../services/OAuth2ProviderManager.js'

Container.set(OAuth2ProviderManager, {
  getProvider: vi.fn()
})

const { getLogoutMode, buildEndSessionUrl } = await import('../routes/user.js')
const providerManager = Container.get(OAuth2ProviderManager) as any

describe('getLogoutMode', () => {
  const originalMode = process.env.VITE_OBP_LOGOUT_MODE

  afterEach(() => {
    if (originalMode === undefined) {
      delete process.env.VITE_OBP_LOGOUT_MODE
    } else {
      process.env.VITE_OBP_LOGOUT_MODE = originalMode
    }
  })

  it('defaults to public when unset', () => {
    delete process.env.VITE_OBP_LOGOUT_MODE
    expect(getLogoutMode()).toBe('public')
  })

  it('returns internal when explicitly set (case-insensitive, trimmed)', () => {
    process.env.VITE_OBP_LOGOUT_MODE = '  Internal  '
    expect(getLogoutMode()).toBe('internal')
  })

  it('falls back to public for an unrecognised value', () => {
    process.env.VITE_OBP_LOGOUT_MODE = 'nonsense'
    expect(getLogoutMode()).toBe('public')
  })
})

describe('buildEndSessionUrl', () => {
  const fakeReq: any = { protocol: 'https', get: () => 'explorer.test' }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns null when there is no provider', () => {
    expect(buildEndSessionUrl(undefined, 'id-token', fakeReq)).toBeNull()
  })

  it('returns null when the provider is not found', () => {
    providerManager.getProvider.mockReturnValue(undefined)
    expect(buildEndSessionUrl('keycloak', 'id-token', fakeReq)).toBeNull()
  })

  it('returns null when the provider has no end_session_endpoint', () => {
    providerManager.getProvider.mockReturnValue({ getEndSessionEndpoint: () => undefined })
    expect(buildEndSessionUrl('keycloak', 'id-token', fakeReq)).toBeNull()
  })

  it('returns null when there is no id_token', () => {
    providerManager.getProvider.mockReturnValue({
      getEndSessionEndpoint: () => 'https://idp.test/logout'
    })
    expect(buildEndSessionUrl('keycloak', undefined, fakeReq)).toBeNull()
  })

  it('builds the end-session URL with id_token_hint, redirect, and client_id', () => {
    providerManager.getProvider.mockReturnValue({
      getEndSessionEndpoint: () => 'https://idp.test/logout',
      clientId: 'test-client'
    })

    const url = buildEndSessionUrl('keycloak', 'id-token-value', fakeReq)

    expect(url).not.toBeNull()
    const parsed = new URL(url as string)
    expect(parsed.origin + parsed.pathname).toBe('https://idp.test/logout')
    expect(parsed.searchParams.get('id_token_hint')).toBe('id-token-value')
    expect(parsed.searchParams.get('client_id')).toBe('test-client')
    expect(parsed.searchParams.get('post_logout_redirect_uri')).toBeTruthy()
  })
})
