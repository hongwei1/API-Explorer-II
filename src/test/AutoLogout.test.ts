import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises, VueWrapper } from '@vue/test-utils'
import AutoLogout from '@/components/AutoLogout.vue'

// AutoLogout is a security-relevant control (idle-session logout) with zero
// prior coverage. It arms warning/logout timers on mount, replaces the
// hardcoded defaults with the server-suggested timeout once fetched, resets
// on user activity, and "logs out" by clicking the #logoff element.

function mockSuggestedTimeout(seconds: number | null) {
  global.fetch = vi.fn(() =>
    Promise.resolve(
      new Response(JSON.stringify(seconds === null ? {} : { timeout_in_seconds: seconds }), {
        status: 200
      })
    )
  ) as any
}

describe('AutoLogout', () => {
  let logoffClick: ReturnType<typeof vi.fn>
  let logoffButton: HTMLButtonElement
  let wrapper: VueWrapper<any> | undefined

  beforeEach(() => {
    vi.useFakeTimers()
    logoffButton = document.createElement('button')
    logoffButton.id = 'logoff'
    logoffClick = vi.fn()
    logoffButton.click = logoffClick
    document.body.appendChild(logoffButton)
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = undefined
    logoffButton.remove()
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('clicks #logoff after the server-suggested timeout elapses with no activity', async () => {
    mockSuggestedTimeout(100) // 100s logout, warning at 70s
    wrapper = mount(AutoLogout)
    await flushPromises() // let the suggested-timeout fetch apply

    await vi.advanceTimersByTimeAsync(99_000)
    expect(logoffClick).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1_000)
    expect(logoffClick).toHaveBeenCalledTimes(1)
  })

  it('user activity resets the countdown', async () => {
    mockSuggestedTimeout(100)
    wrapper = mount(AutoLogout)
    await flushPromises()

    // 60s in, the user moves the mouse - the timers re-arm from zero.
    await vi.advanceTimersByTimeAsync(60_000)
    window.dispatchEvent(new Event('mousemove'))

    // 99s after the reset (159s total, well past the original 100s deadline)
    // the user is still logged in...
    await vi.advanceTimersByTimeAsync(99_000)
    expect(logoffClick).not.toHaveBeenCalled()

    // ...and gets logged out exactly when the reset countdown expires.
    await vi.advanceTimersByTimeAsync(1_000)
    expect(logoffClick).toHaveBeenCalledTimes(1)
  })

  it('falls back to the built-in default when the suggested-timeout fetch fails', async () => {
    global.fetch = vi.fn(() => Promise.reject(new Error('OBP unreachable'))) as any
    wrapper = mount(AutoLogout)
    await flushPromises()

    // Default logout delay is 5 minutes.
    await vi.advanceTimersByTimeAsync(299_000)
    expect(logoffClick).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1_000)
    expect(logoffClick).toHaveBeenCalledTimes(1)
  })

  it('stops all timers on unmount so no logout fires afterwards', async () => {
    mockSuggestedTimeout(100)
    wrapper = mount(AutoLogout)
    await flushPromises()

    wrapper.unmount()
    wrapper = undefined

    await vi.advanceTimersByTimeAsync(600_000)
    expect(logoffClick).not.toHaveBeenCalled()
  })
})
