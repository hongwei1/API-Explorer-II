import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

const mockGetobpConsent = vi.fn()
vi.mock('@/obp/common-functions', () => ({
  getobpConsent: (...args: any[]) => mockGetobpConsent(...args)
}))

const { useChat } = await import('@/stores/chat')

describe('chat store handleAuthentication', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setActivePinia(createPinia())
  })

  it('marks the user authenticated when the backend consent call succeeds', async () => {
    mockGetobpConsent.mockResolvedValue({ consent_id: 'abc', jwt: 'jwt-value' })
    const chat = useChat()

    await chat.handleAuthentication()

    expect(chat.userIsAuthenticated).toBe(true)
  })

  it('throws and stays unauthenticated when the consent response is empty', async () => {
    mockGetobpConsent.mockResolvedValue(undefined)
    const chat = useChat()

    await expect(chat.handleAuthentication()).rejects.toThrow('Failed to grant consent')
    expect(chat.userIsAuthenticated).toBe(false)
  })

  it('propagates a consent-call failure (e.g. Opey rejected the session server-side)', async () => {
    mockGetobpConsent.mockRejectedValue(new Error('Failed to get consent: 500'))
    const chat = useChat()

    await expect(chat.handleAuthentication()).rejects.toThrow('Failed to get consent: 500')
    expect(chat.userIsAuthenticated).toBe(false)
  })
})
