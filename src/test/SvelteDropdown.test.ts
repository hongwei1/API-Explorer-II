import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import SvelteDropdown from '@/components/SvelteDropdown.vue'

// Regression coverage: the watch() that remounts the Svelte Dropdown on prop
// change used to re-add a 'select' listener on every remount, on top of the
// one from onMounted, so N prop changes meant N+1 listeners and N+1 emits per
// click. The listener must be attached exactly once (it stays useful across
// remounts because the Svelte component dispatches 'select' with
// bubbles: true onto the persistent containerRef div).
describe('SvelteDropdown', () => {
  it('emits select exactly once per dispatched event after a prop change triggers a remount', async () => {
    const wrapper = mount(SvelteDropdown, {
      props: { label: 'Banks', items: [] }
    })

    // Simulate the real trigger: items start empty and get populated by an
    // async fetch after mount (as Menu.vue's bankItems does).
    await wrapper.setProps({ items: ['Bank A', 'Bank B'] })
    await wrapper.vm.$nextTick()

    wrapper.element.dispatchEvent(
      new CustomEvent('select', { detail: 'Bank A', bubbles: true })
    )

    expect(wrapper.emitted('select')).toHaveLength(1)
    expect(wrapper.emitted('select')?.[0]).toEqual(['Bank A'])
  })

  it('still emits exactly once after multiple prop changes', async () => {
    const wrapper = mount(SvelteDropdown, {
      props: { label: 'Banks', items: [] }
    })

    await wrapper.setProps({ items: ['Bank A'] })
    await wrapper.setProps({ items: ['Bank A', 'Bank B'] })
    await wrapper.setProps({ label: 'My Banks', items: ['Bank A', 'Bank B'] })
    await wrapper.vm.$nextTick()

    wrapper.element.dispatchEvent(
      new CustomEvent('select', { detail: 'Bank B', bubbles: true })
    )

    expect(wrapper.emitted('select')).toHaveLength(1)
  })
})
