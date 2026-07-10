import { describe, it, expect, vi } from 'vitest'
import type { Response } from 'express'
import { sendOBPError } from '../routes/obp.js'

// sendOBPError forwards OBPClientService's error to the client. Its whole job
// is to NOT double-wrap an OBP error body that is already {code, message}
// shaped - that would give clients a nested code/message inside message.
function mockRes(): Response {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis()
  } as unknown as Response
}

describe('sendOBPError', () => {
  it('forwards a JSON OBP error body verbatim instead of double-wrapping it', () => {
    const res = mockRes()
    const error = {
      status: 401,
      message: '{"code":401,"message":"OBP-20217: Consumer is disabled."}'
    }

    sendOBPError(res, error)

    expect(res.status).toHaveBeenCalledWith(401)
    expect(res.json).toHaveBeenCalledWith({
      code: 401,
      message: 'OBP-20217: Consumer is disabled.'
    })
  })

  it('wraps a non-JSON error message in a generic envelope', () => {
    const res = mockRes()
    const error = { status: 502, message: 'Bad Gateway' }

    sendOBPError(res, error)

    expect(res.status).toHaveBeenCalledWith(502)
    expect(res.json).toHaveBeenCalledWith({ code: 502, message: 'Bad Gateway' })
  })

  it('defaults to a 500 status when the error has none', () => {
    const res = mockRes()
    const error = { message: 'boom' }

    sendOBPError(res, error)

    expect(res.status).toHaveBeenCalledWith(500)
    expect(res.json).toHaveBeenCalledWith({ code: 500, message: 'boom' })
  })

  it('falls back to a generic message when the error has none', () => {
    const res = mockRes()

    sendOBPError(res, {})

    expect(res.json).toHaveBeenCalledWith({ code: 500, message: 'Internal server error' })
  })

  it('does not treat a JSON array or primitive as an object body', () => {
    const res = mockRes()
    const error = { status: 400, message: '"just a string"' }

    sendOBPError(res, error)

    // JSON.parse succeeds but the result isn't an object, so it must fall
    // through to the generic envelope rather than being sent as the body.
    expect(res.json).toHaveBeenCalledWith({ code: 400, message: '"just a string"' })
  })
})
