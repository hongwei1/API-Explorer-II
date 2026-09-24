import { describe, it, expect, vi } from 'vitest'
import { isObpReachable } from '../services/ObpReachability.js'

describe('isObpReachable', () => {
  it('asks only the OBP API root endpoint, without credentials', async () => {
    const client = { get: vi.fn().mockResolvedValue({ version: 'v5.1.0', git_commit: 'abc' }) }

    await expect(isObpReachable(client, 'v5.1.0')).resolves.toBe(true)
    expect(client.get).toHaveBeenCalledTimes(1)
    expect(client.get).toHaveBeenCalledWith('/obp/v5.1.0/root', null)
  })

  it('is false for an error response from the API', async () => {
    const client = { get: vi.fn().mockResolvedValue({ code: 500, message: 'boom' }) }
    await expect(isObpReachable(client, 'v5.1.0')).resolves.toBe(false)
  })

  it('is false for an empty or missing response', async () => {
    await expect(isObpReachable({ get: vi.fn().mockResolvedValue({}) }, 'v5.1.0')).resolves.toBe(false)
    await expect(isObpReachable({ get: vi.fn().mockResolvedValue(undefined) }, 'v5.1.0')).resolves.toBe(false)
  })

  it('is false when the request throws', async () => {
    const client = { get: vi.fn().mockRejectedValue(new Error('ECONNREFUSED')) }
    await expect(isObpReachable(client, 'v5.1.0')).resolves.toBe(false)
  })
})
