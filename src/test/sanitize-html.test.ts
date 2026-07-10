// @vitest-environment jsdom
//
// DOMPurify needs a spec-compliant DOM to sanitize against. happy-dom (this
// project's default test environment) doesn't behave correctly here - it
// executes <script> content it should treat as inert during DOMPurify's
// internal parsing step, and in one observed run failed to strip disallowed
// tags at all. jsdom is DOMPurify's own documented Node testing environment,
// so this file overrides to it explicitly.
import { describe, it, expect } from 'vitest'
import { sanitizeHtml } from '@/utils/sanitize-html'

// Guards the shared sanitizer used by every v-html sink that renders OBP/Opey
// content (ChatMessage.vue, Content.vue, GlossaryView.vue): it must strip
// script/event-handler injection while leaving benign markup intact.
describe('sanitizeHtml', () => {
  it('strips <script> tags', () => {
    const result = sanitizeHtml('<p>hello</p><script>alert(1)</script>')
    expect(result).not.toContain('<script')
    expect(result).not.toContain('alert')
    expect(result).toContain('hello')
  })

  it('strips inline event-handler attributes like onerror', () => {
    const result = sanitizeHtml('<img src="x" onerror="alert(1)">')
    expect(result).not.toContain('onerror')
  })

  it('strips javascript: URIs from links', () => {
    const result = sanitizeHtml('<a href="javascript:alert(1)">click</a>')
    expect(result).not.toContain('javascript:')
  })

  it('preserves benign formatting markup', () => {
    const result = sanitizeHtml('<p>Hello <strong>world</strong>, see <a href="https://example.com">docs</a>.</p>')
    expect(result).toContain('<strong>world</strong>')
    expect(result).toContain('href="https://example.com"')
  })
})
