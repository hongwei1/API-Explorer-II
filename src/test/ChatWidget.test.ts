import { mount } from '@vue/test-utils';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import ChatWidget from '../components/ChatWidget.vue'
import { setActivePinia, createPinia } from 'pinia';

// ChatWidget calls useRoute() to build its login URL; mounting it in isolation
// (no router installed) made route undefined and crashed every render that
// reached the login branch. Stub the composable instead of wiring a full router.
vi.mock('vue-router', () => ({
    useRoute: () => ({ path: '/', query: {} })
}))

describe('ChatWidget', () => {

    beforeEach(() => {

        // Init Pinia Store
        setActivePinia(createPinia())

        // create a mock stream
        const mockStream = new ReadableStream<Uint8Array>({
            start(controller) {
                controller.enqueue(new TextEncoder().encode(`data: {"type":"token","content":"test"}\n`));
                controller.close();
            },
        });

        // mock the fetch function
        global.fetch = vi.fn(() =>
            Promise.resolve(new Response(mockStream, {
                headers: { 'content-type': 'text/event-stream' },
                status: 200,
            }))
        );
    })
    afterEach(() => {
        vi.clearAllMocks()
    })
    it('should call the stream function when sending a user message', async () => {
        const wrapper = mount(ChatWidget, {})
        wrapper.vm.chat.stream = vi.fn(async () => {})
        await wrapper.vm.onSubmit()
        expect(wrapper.vm.chat.stream).toHaveBeenCalled()
    })
    
    it('should trigger onSubmit when enter key is pressed in the input', async () => {
        const wrapper = mount(ChatWidget, {})
        
        // This opens the chat widget
        wrapper.vm.chatOpen = true
        await wrapper.vm.$nextTick()

        // Get the input element and trigger the keypress enter event
        // This will probably fail if the class name of the parent div is changed, or if the input type is moved i.e. from textarea to input or el-input
        const input = wrapper.get('.user-input-container textarea')
        input.trigger('keypress.enter')
    })
    
    it('displays chat when chatOpen is set to true', async () => {
        const wrapper = mount(ChatWidget, {})
        wrapper.vm.chatOpen = true
        await wrapper.vm.$nextTick()
        expect(wrapper.find('.chat-container').exists()).toBe(true)
    })

    it('should show a log in screen if user is not authenticated', async () => {
        const wrapper = mount(ChatWidget, {})
        wrapper.vm.chat.userIsAuthenticated = false

        wrapper.vm.chatOpen = true
        await wrapper.vm.$nextTick()
        console.log(wrapper.html())
        expect(wrapper.find('.login-container').exists()).toBe(true)
    })
})