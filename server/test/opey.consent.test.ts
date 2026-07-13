import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Container } from 'typedi'
import express from 'express'
import request from 'supertest'
import OpeyClientService from '../services/OpeyClientService.js'
import OBPConsentsService from '../services/OBPConsentsService.js'

// Regression coverage: /opey/consent must call establishSession on BOTH the
// existing-consent and newly-created-consent branches, so a consent OBP
// accepts but Opey rejects fails right here (at login/consent time) instead
// of surfacing as a generic error on the user's first chat message.

const mockGetOpeyConfig = vi.fn()
const mockEstablishSession = vi.fn()
const mockGetExistingOpeyConsentId = vi.fn()
const mockGetConsentByConsentId = vi.fn()
const mockCreateConsent = vi.fn()

Container.set(OpeyClientService, {
  getOpeyConfig: mockGetOpeyConfig,
  establishSession: mockEstablishSession
})
Container.set(OBPConsentsService, {
  getExistingOpeyConsentId: mockGetExistingOpeyConsentId,
  getConsentByConsentId: mockGetConsentByConsentId,
  createConsent: mockCreateConsent
})

const opeyRouter = (await import('../routes/opey.js')).default

function buildApp(sessionData: Record<string, any> = {}) {
  const app = express()
  app.use(express.json())
  app.use((req: any, _res, next) => {
    req.session = sessionData
    next()
  })
  app.use('/api', opeyRouter)
  return app
}

describe('POST /opey/consent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetOpeyConfig.mockResolvedValue({ baseUri: 'http://opey.test:5000', paths: {} })
  })

  it('establishes the session on the existing-consent branch and returns its consent', async () => {
    mockGetExistingOpeyConsentId.mockResolvedValue('existing-consent-id')
    mockGetConsentByConsentId.mockResolvedValue({
      consent_id: 'existing-consent-id',
      jwt: 'existing-jwt'
    })
    mockEstablishSession.mockResolvedValue('session=established')

    const res = await request(buildApp()).post('/api/opey/consent')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ consent_id: 'existing-consent-id', jwt: 'existing-jwt' })
    expect(mockEstablishSession).toHaveBeenCalledTimes(1)
    expect(mockCreateConsent).not.toHaveBeenCalled()
  })

  it('establishes the session on the new-consent branch and returns the created consent', async () => {
    mockGetExistingOpeyConsentId.mockResolvedValue(null)
    mockCreateConsent.mockImplementation(async (session: any) => {
      session.opeyConfig.authConfig = {
        obpConsent: { consent_id: 'new-consent-id', jwt: 'new-jwt' }
      }
    })
    mockEstablishSession.mockResolvedValue('session=established')

    const res = await request(buildApp()).post('/api/opey/consent')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ consent_id: 'new-consent-id', jwt: 'new-jwt' })
    expect(mockEstablishSession).toHaveBeenCalledTimes(1)
  })

  it('fails the request (not just a later chat message) when Opey rejects the session', async () => {
    mockGetExistingOpeyConsentId.mockResolvedValue('existing-consent-id')
    mockGetConsentByConsentId.mockResolvedValue({ consent_id: 'existing-consent-id', jwt: 'jwt' })
    mockEstablishSession.mockRejectedValue(new Error('AuthConfig not valid: consent rejected'))

    const res = await request(buildApp()).post('/api/opey/consent')

    expect(res.status).toBe(500)
  })
})
