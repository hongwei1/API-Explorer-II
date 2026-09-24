import { beforeEach, describe, expect, it, vi } from 'vitest'

const { get } = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('superagent', () => ({ default: { get } }))

import { isServerUp } from '../obp'

describe('isServerUp', () => {
  beforeEach(() => {
    get.mockReset()
  })

  it('uses the lightweight health endpoint', async () => {
    get.mockResolvedValue({ body: { status: 'ok' } })

    await expect(isServerUp()).resolves.toBe(true)
    expect(get).toHaveBeenCalledWith('/api/health')
  })

  it('returns false when the health endpoint cannot be reached', async () => {
    get.mockRejectedValue(new Error('unreachable'))

    await expect(isServerUp()).resolves.toBe(false)
  })
})
