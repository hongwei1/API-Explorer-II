import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { PassThrough } from 'node:stream'
import { attachInactivityTimeout } from '../routes/opey.js'

// Regression coverage for the 30s stream timeout fix: it used to be a flat
// one-shot setTimeout that destroyed the stream 30s after it started, even if
// data was still actively arriving. attachInactivityTimeout must reset on
// every 'data' event instead.

describe('attachInactivityTimeout', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('destroys the stream after the timeout with no activity', () => {
    const stream = new PassThrough()
    const destroySpy = vi.spyOn(stream, 'destroy')
    attachInactivityTimeout(stream, 30000)

    vi.advanceTimersByTime(29999)
    expect(destroySpy).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(destroySpy).toHaveBeenCalledTimes(1)
  })

  it('does not destroy an actively-streaming response that outlives one timeout window', () => {
    const stream = new PassThrough()
    const destroySpy = vi.spyOn(stream, 'destroy')
    attachInactivityTimeout(stream, 30000)

    // Data arrives just before each deadline, resetting the timer every time -
    // this simulates a long multi-step tool-calling response.
    for (let i = 0; i < 5; i++) {
      vi.advanceTimersByTime(29000)
      stream.emit('data', Buffer.from('chunk'))
      expect(destroySpy).not.toHaveBeenCalled()
    }

    // Once activity stops, the (reset) timer still fires on schedule.
    vi.advanceTimersByTime(30000)
    expect(destroySpy).toHaveBeenCalledTimes(1)
  })

  it('clears the timer when the stream ends, so it never fires afterwards', () => {
    const stream = new PassThrough()
    const destroySpy = vi.spyOn(stream, 'destroy')
    attachInactivityTimeout(stream, 30000)

    stream.emit('end')
    vi.advanceTimersByTime(60000)

    expect(destroySpy).not.toHaveBeenCalled()
  })

  it('clears the timer when the stream errors, so it never fires afterwards', () => {
    const stream = new PassThrough()
    const destroySpy = vi.spyOn(stream, 'destroy')
    attachInactivityTimeout(stream, 30000)

    stream.emit('error', new Error('boom'))
    vi.advanceTimersByTime(60000)

    expect(destroySpy).not.toHaveBeenCalled()
  })
})
