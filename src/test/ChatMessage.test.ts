// @vitest-environment jsdom
//
// ChatMessage renders its content through markdown-it + DOMPurify (sanitizeHtml).
// DOMPurify needs a spec-compliant DOM to behave deterministically; happy-dom
// (this project's default test env) does not, so the committed snapshot below
// is generated and compared under jsdom to stay portable across environments.
import { mount } from '@vue/test-utils';
import { describe, it, expect } from 'vitest';
import ChatMessage from '../components/ChatMessage.vue'

describe('ChatMessage', () => {
  it('should render correctly on human message', () => {
    const humanMessage = {
      id: 123,
      role: 'user',
      content: 'Hello Opey!',
    }
    const wrapper = mount(ChatMessage, {
      props: {
        message: humanMessage
      }
    })

    expect(wrapper.text()).toContain(humanMessage.content)
    expect(wrapper.html()).toMatchSnapshot()
  })

  it('should render correctly on assistant message', () => {
    const assistantMessage = {
      id: 123,
      role: 'assistant',
      content: 'Hi there, how can I help you today?',
    }
    const wrapper = mount(ChatMessage, {
      props: {
        message: assistantMessage
      }
    })

    expect(wrapper.text()).toContain(assistantMessage.content)
    expect(wrapper.html()).toMatchSnapshot()
  })

  
})

