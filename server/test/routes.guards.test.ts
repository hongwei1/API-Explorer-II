import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Container } from 'typedi'
import express from 'express'
import request from 'supertest'
import OBPClientService from '../services/OBPClientService.js'
import OpeyClientService from '../services/OpeyClientService.js'
import OBPConsentsService from '../services/OBPConsentsService.js'
import { OAuth2ProviderManager } from '../services/OAuth2ProviderManager.js'

// Cheap-but-real guard coverage for the three routers, driven through
// supertest with the services mocked in the typedi container (the routers
// resolve them at module load, so Container.set must run before the imports).

const mockObpGet = vi.fn()
Container.set(OBPClientService, {
  get: mockObpGet,
  create: vi.fn(),
  update: vi.fn(),
  discard: vi.fn()
})
Container.set(OpeyClientService, {
  getOpeyConfig: vi.fn(),
  establishSession: vi.fn(),
  stream: vi.fn(),
  invoke: vi.fn()
})
Container.set(OBPConsentsService, {
  getExistingOpeyConsentId: vi.fn(),
  getConsentByConsentId: vi.fn(),
  createConsent: vi.fn()
})
Container.set(OAuth2ProviderManager, { getProvider: vi.fn() })

const opeyRouter = (await import('../routes/opey.js')).default
const userRouter = (await import('../routes/user.js')).default
const obpRouter = (await import('../routes/obp.js')).default

function buildApp(router: any, sessionData?: Record<string, any>) {
  const app = express()
  app.use(express.json())
  app.use((req: any, _res, next) => {
    if (sessionData !== undefined) {
      req.session = sessionData
    }
    next()
  })
  app.use('/api', router)
  return app
}

describe('POST /opey/stream guards', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when there is no session at all', async () => {
    const res = await request(buildApp(opeyRouter)).post('/api/opey/stream').send({ message: 'hi' })
    expect(res.status).toBe(401)
  })

  it('returns 500 when the session has no opeyConfig (no consent yet)', async () => {
    const res = await request(buildApp(opeyRouter, {}))
      .post('/api/opey/stream')
      .send({ message: 'hi' })
    expect(res.status).toBe(500)
  })
})

describe('GET /user/current branches', () => {
  beforeEach(() => vi.clearAllMocks())

  const oauth2User = {
    sub: 'token-sub-id',
    username: 'tester',
    email: 'tester@example.com',
    provider: 'keycloak'
  }

  it('returns an empty object when nobody is logged in', async () => {
    const res = await request(buildApp(userRouter, {})).get('/api/user/current')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({})
  })

  it('upgrades user_id from OBP when the call succeeds', async () => {
    mockObpGet.mockResolvedValue({ user_id: 'real-obp-user-id' })
    const session = {
      oauth2_user: oauth2User,
      clientConfig: { oauth2: { accessToken: 'token' } }
    }

    const res = await request(buildApp(userRouter, session)).get('/api/user/current')

    expect(res.body.user_id).toBe('real-obp-user-id')
    expect(res.body.username).toBe('tester')
  })

  it('falls back to the token sub when the OBP call fails', async () => {
    mockObpGet.mockRejectedValue(new Error('OBP down'))
    const session = {
      oauth2_user: oauth2User,
      clientConfig: { oauth2: { accessToken: 'token' } }
    }

    const res = await request(buildApp(userRouter, session)).get('/api/user/current')

    expect(res.body.user_id).toBe('token-sub-id')
  })

  it('falls back to the token sub without calling OBP when there is no access token', async () => {
    const session = { oauth2_user: oauth2User }

    const res = await request(buildApp(userRouter, session)).get('/api/user/current')

    expect(res.body.user_id).toBe('token-sub-id')
    expect(mockObpGet).not.toHaveBeenCalled()
  })
})

describe('obp proxy x-bg-consent-id forwarding', () => {
  beforeEach(() => vi.clearAllMocks())

  it('threads the header into the Berlin Group consent config passed to the service', async () => {
    mockObpGet.mockResolvedValue({ ok: true })
    const session = { clientConfig: { oauth2: { accessToken: 'token' } } }

    await request(buildApp(obpRouter, session))
      .get('/api/get?path=/berlin-group/v1.3/accounts')
      .set('x-bg-consent-id', 'bg-consent-123')

    expect(mockObpGet).toHaveBeenCalledWith(
      '/berlin-group/v1.3/accounts',
      expect.objectContaining({ berlinGroup: { consentId: 'bg-consent-123' } })
    )
  })

  it('does not attach a berlinGroup config when the header is absent', async () => {
    mockObpGet.mockResolvedValue({ ok: true })
    const session = { clientConfig: { oauth2: { accessToken: 'token' } } }

    await request(buildApp(obpRouter, session)).get('/api/get?path=/obp/v5.1.0/banks')

    const [, config] = mockObpGet.mock.calls[0]
    expect(config.berlinGroup).toBeUndefined()
  })
})
