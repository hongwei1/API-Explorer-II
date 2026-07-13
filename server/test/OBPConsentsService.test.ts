import { describe, it, expect, beforeEach, vi, Mock, Mocked } from 'vitest'
import { Container } from 'typedi'
import { ConsentApi } from 'obp-api-typescript'
import axios from 'axios'

vi.mock('axios')
const mockedAxios = axios as Mocked<typeof axios>

import OBPClientService from '../services/OBPClientService.js'
import OBPConsentsService from '../services/OBPConsentsService.js'

// OBPConsentsService pulls OBPClientService from the typedi container in its
// constructor, so the mock has to be registered with Container.set - a plain
// vi.mock of the class module never reaches the container.
const mockOBPClientService = {
  getOBPClientConfig: vi.fn(() => ({
    baseUri: 'https://test.openbankproject.com',
    version: 'v5.1.0'
  }))
}

// A session shaped like what the OAuth2 callback stores today: Bearer token
// under clientConfig.oauth2 (the legacy oauthConfig consumer-key shape is gone).
function makeSession(): any {
  return {
    clientConfig: {
      baseUri: 'https://test.openbankproject.com',
      version: 'v5.1.0',
      oauth2: {
        accessToken: 'test-access-token',
        tokenType: 'Bearer'
      }
    }
  }
}

const OPEY_CONSUMER_ID = process.env.VITE_OPEY_CONSUMER_ID as string
const FUTURE_EXP = Math.floor(Date.now() / 1000) + 3600
const PAST_EXP = Math.floor(Date.now() / 1000) - 3600

describe('OBPConsentsService.createUserConsentsClient', () => {
  let obpConsentsService: OBPConsentsService

  beforeEach(() => {
    vi.clearAllMocks()
    Container.set(OBPClientService, mockOBPClientService)
    obpConsentsService = new OBPConsentsService()
  })

  it('should return a ConsentApi client for a logged in user', async () => {
    const consentClient = await obpConsentsService.createUserConsentsClient(
      makeSession(),
      '/consents',
      'POST'
    )
    expect(consentClient).toBeDefined()
    expect(consentClient).toBeInstanceOf(ConsentApi)
    expect(mockOBPClientService.getOBPClientConfig).toHaveBeenCalled()
  })

  it('should throw when the session has no OAuth2 access token', async () => {
    const session: any = { clientConfig: {} }
    await expect(
      obpConsentsService.createUserConsentsClient(session, '/consents', 'POST')
    ).rejects.toThrow('User is not logged in')
  })
})

describe('OBPConsentsService.createConsent', () => {
  let obpConsentsService: OBPConsentsService
  let mockCreateConsentImplicit: Mock
  let mockSession: any

  beforeEach(() => {
    vi.clearAllMocks()
    Container.set(OBPClientService, mockOBPClientService)
    obpConsentsService = new OBPConsentsService()
    mockSession = makeSession()

    mockCreateConsentImplicit = vi.fn().mockResolvedValue({
      data: {
        consent_id: '12345678',
        jwt: 'header.payload.signature',
        status: 'INITIATED'
      }
    })
    const mockConsentApi = {
      oBPv510CreateConsentImplicit: mockCreateConsentImplicit
    } as unknown as ConsentApi
    vi.spyOn(obpConsentsService, 'createUserConsentsClient').mockResolvedValue(mockConsentApi)
  })

  it('returns the consent created via the SDK client', async () => {
    const consent = await obpConsentsService.createConsent(mockSession)

    expect(consent).toBeDefined()
    expect(consent).toHaveProperty('consent_id', '12345678')
    expect(consent).toHaveProperty('jwt', 'header.payload.signature')
    expect(consent).toHaveProperty('status', 'INITIATED')
    expect(mockCreateConsentImplicit).toHaveBeenCalled()
  })

  it('stores the consent on session.opeyConfig.authConfig', async () => {
    await obpConsentsService.createConsent(mockSession)

    expect(mockSession.opeyConfig?.authConfig?.obpConsent).toMatchObject({
      consent_id: '12345678',
      jwt: 'header.payload.signature',
      status: 'INITIATED'
    })
  })
})

describe('OBPConsentsService.getExistingOpeyConsentId', () => {
  let obpConsentsService: OBPConsentsService
  let mockSession: any

  beforeEach(() => {
    vi.clearAllMocks()
    Container.set(OBPClientService, mockOBPClientService)
    obpConsentsService = new OBPConsentsService()
    mockSession = makeSession()
  })

  it('returns the ACCEPTED consent matching the Opey consumer id', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        consents: [
          {
            consent_id: 'matching-accepted',
            consumer_id: OPEY_CONSUMER_ID,
            status: 'ACCEPTED',
            jwt_payload: { exp: FUTURE_EXP }
          },
          {
            consent_id: 'other-consumer',
            consumer_id: 'some-other-consumer-id',
            status: 'ACCEPTED',
            jwt_payload: { exp: FUTURE_EXP }
          },
          {
            consent_id: 'matching-but-initiated',
            consumer_id: OPEY_CONSUMER_ID,
            status: 'INITIATED',
            jwt_payload: { exp: FUTURE_EXP }
          }
        ]
      }
    })

    const consentId = await obpConsentsService.getExistingOpeyConsentId(mockSession)
    expect(consentId).toBe('matching-accepted')
  })

  it('skips expired consents and returns null when none are valid', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        consents: [
          {
            consent_id: 'matching-but-expired',
            consumer_id: OPEY_CONSUMER_ID,
            status: 'ACCEPTED',
            jwt_payload: { exp: PAST_EXP }
          }
        ]
      }
    })

    const consentId = await obpConsentsService.getExistingOpeyConsentId(mockSession)
    expect(consentId).toBeNull()
  })

  it('throws when the user is not logged in', async () => {
    await expect(
      obpConsentsService.getExistingOpeyConsentId({ clientConfig: {} } as any)
    ).rejects.toThrow('User is not logged in')
  })
})

describe('OBPConsentsService.checkConsentExpired', () => {
  let obpConsentsService: OBPConsentsService

  beforeEach(() => {
    Container.set(OBPClientService, mockOBPClientService)
    obpConsentsService = new OBPConsentsService()
  })

  it('returns false for a future exp and true for a past exp', async () => {
    await expect(
      obpConsentsService.checkConsentExpired({ jwt_payload: { exp: FUTURE_EXP } })
    ).resolves.toBe(false)
    await expect(
      obpConsentsService.checkConsentExpired({ jwt_payload: { exp: PAST_EXP } })
    ).resolves.toBe(true)
  })
})
