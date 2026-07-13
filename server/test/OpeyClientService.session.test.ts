import { describe, it, expect, beforeEach, vi } from 'vitest'
import OpeyClientService from '../services/OpeyClientService.js'
import { OpeyConfig, UserInput } from '../schema/OpeySchema.js'

// Regression coverage for the Opey session-establishment fix: sessions used to
// be created fresh on every stream()/invoke() call and invoke() never sent a
// cookie at all. getOrCreateSessionCookie/establishSession/createOpeySession
// are the methods that now make session reuse and eager validation possible.

const acceptedAuthConfig = {
  authConfig: {
    obpConsent: {
      consent_id: 'test-consent-id',
      status: 'ACCEPTED' as const,
      jwt: 'test-jwt-token'
    }
  }
}

function mockCreateSessionResponse(setCookieHeader: string | null) {
  const headers = setCookieHeader ? { 'set-cookie': setCookieHeader } : {}
  return new Response(JSON.stringify({}), { status: 200, headers })
}

describe('OpeyClientService.getOrCreateSessionCookie', () => {
  let opeyClientService: OpeyClientService

  beforeEach(() => {
    vi.clearAllMocks()
    opeyClientService = new OpeyClientService()
  })

  it('reuses an existing sessionCookie without calling /create-session', async () => {
    global.fetch = vi.fn() as any
    const config: OpeyConfig = {
      baseUri: 'http://localhost:5000',
      paths: {},
      sessionCookie: 'session=already-established'
    }

    const cookie = await opeyClientService.getOrCreateSessionCookie(config)

    expect(cookie).toBe('session=already-established')
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('creates a session and persists the cookie onto the caller-owned config', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve(mockCreateSessionResponse('session=freshly-created; Path=/'))
    ) as any
    const config: OpeyConfig = {
      baseUri: 'http://localhost:5000',
      paths: {},
      ...acceptedAuthConfig
    }
    const persistTo: Partial<OpeyConfig> = {}

    const cookie = await opeyClientService.getOrCreateSessionCookie(config, persistTo)

    expect(cookie).toBe('session=freshly-created')
    expect(global.fetch).toHaveBeenCalledTimes(1)
    // Reused by the caller's own config object (e.g. session.opeyConfig) so the
    // next stream()/invoke() call in the same conversation skips /create-session.
    expect(persistTo.sessionCookie).toBe('session=freshly-created')
  })
})

describe('OpeyClientService.createOpeySession', () => {
  let opeyClientService: OpeyClientService
  const config: OpeyConfig = {
    baseUri: 'http://localhost:5000',
    paths: {},
    ...acceptedAuthConfig
  }

  beforeEach(() => {
    vi.clearAllMocks()
    opeyClientService = new OpeyClientService()
  })

  it('parses the session cookie via headers.getSetCookie() when available', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({}), {
          status: 200,
          headers: { 'set-cookie': 'session=via-getSetCookie; Path=/; HttpOnly' }
        })
      )
    ) as any

    const cookie = await opeyClientService.createOpeySession(config)
    expect(cookie).toBe('session=via-getSetCookie')
  })

  it('throws when Opey returns no session cookie', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve(mockCreateSessionResponse(null))
    ) as any

    await expect(opeyClientService.createOpeySession(config)).rejects.toThrow(
      'Opey did not return a session cookie from /create-session'
    )
  })

  it('throws when /create-session itself fails', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve(new Response('', { status: 500, statusText: 'Internal Server Error' }))
    ) as any

    await expect(opeyClientService.createOpeySession(config)).rejects.toThrow(
      'Failed to create Opey session: 500'
    )
  })
})

describe('OpeyClientService.establishSession', () => {
  let opeyClientService: OpeyClientService

  beforeEach(() => {
    vi.clearAllMocks()
    opeyClientService = new OpeyClientService()
  })

  it('throws immediately when the consent is not valid, without ever calling /create-session', async () => {
    global.fetch = vi.fn() as any

    await expect(
      opeyClientService.establishSession({ authConfig: { obpConsent: { consent_id: 'x', status: 'INITIATED', jwt: 'x' } } })
    ).rejects.toThrow('AuthConfig not valid')
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('establishes and returns a session cookie for a valid consent', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve(mockCreateSessionResponse('session=established-eagerly; Path=/'))
    ) as any

    const opeyConfig: Partial<OpeyConfig> = { ...acceptedAuthConfig }
    const cookie = await opeyClientService.establishSession(opeyConfig)

    expect(cookie).toBe('session=established-eagerly')
    expect(opeyConfig.sessionCookie).toBe('session=established-eagerly')
  })
})

describe('OpeyClientService.invoke', () => {
  let opeyClientService: OpeyClientService
  const user_input: UserInput = { message: 'test message', is_tool_call_approval: false }

  beforeEach(() => {
    vi.clearAllMocks()
    opeyClientService = new OpeyClientService()
  })

  it('forwards both the Consent-JWT and the session Cookie header', async () => {
    global.fetch = vi.fn((url: any) => {
      if (String(url).includes('/create-session')) {
        return Promise.resolve(mockCreateSessionResponse('session=invoke-session; Path=/'))
      }
      return Promise.resolve(new Response(JSON.stringify({ content: 'hi' }), { status: 200 }))
    }) as any

    await opeyClientService.invoke(user_input, { ...acceptedAuthConfig })

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/invoke'),
      expect.objectContaining({
        headers: expect.objectContaining({
          'Consent-JWT': 'test-jwt-token',
          Cookie: 'session=invoke-session'
        })
      })
    )
  })
})
