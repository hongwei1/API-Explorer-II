import { describe, it, expect } from 'vitest'
import { isCodeError } from '../routes/status.js'

describe('isCodeError', () => {
  it('treats an empty or missing response as an error', () => {
    expect(isCodeError(null, '/some/path')).toBe(true)
    expect(isCodeError(undefined, '/some/path')).toBe(true)
    expect(isCodeError({}, '/some/path')).toBe(true)
  })

  it('treats a response with a code >= 400 as an error', () => {
    expect(isCodeError({ code: 400, message: 'bad request' }, '/some/path')).toBe(true)
    expect(isCodeError({ code: 500 }, '/some/path')).toBe(true)
  })

  it('does not treat a response with a code < 400 as an error', () => {
    expect(isCodeError({ code: 200 }, '/some/path')).toBe(false)
  })

  it('does not treat a normal data response (no code field) as an error', () => {
    expect(isCodeError({ banks: [] }, '/some/path')).toBe(false)
  })
})
