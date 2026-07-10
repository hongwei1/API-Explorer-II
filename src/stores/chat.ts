/*
 * Open Bank Project -  API Explorer II
 * Copyright (C) 2023-2024, TESOBE GmbH
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 * Email: contact@tesobe.com
 * TESOBE GmbH
 * Osloerstrasse 16/17
 * Berlin 13359, Germany
 *
 *   This product includes software developed at
 *   TESOBE (http://www.tesobe.com/)
 *
 */

import type { OpeyMessage, ChatStreamInput, RawOpeyMessage, OpeyToolCall, AssistantMessage, UserMessage } from '@/models/MessageModel'
import type { Chat } from '@/models/ChatModel'
import { getobpConsent } from '@/obp/common-functions'
import { defineStore } from 'pinia'
import { v4 as uuidv4 } from 'uuid'

/**
 * Represents a Pinia store for managing chat messages and chatbot responses.
 */
export const useChat = defineStore('chat', {

    state: (): Chat => {
        return {
            messages: [] as OpeyMessage[],
            currentAssistantMessage: {
                content: '',
                role: 'assistant',
                id: '',
            } as AssistantMessage,
            status: 'ready' as 'ready' | 'streaming' | 'error',
            userIsAuthenticated: false,
            threadId: '',
        }
    },

    getters: {

        /**
         * Retrieves or creates a thread ID for the chat.
         * 
         * @param store - The store object that holds the thread ID
         * @param threadId - Optional thread ID to set
         * @returns The current or newly created thread ID
         * 
         * If a threadId is provided, it will be set in the store and returned.
         * This is useful if the you want to match the thread ID on the chatbot server side.
         * 
         * If no threadId is provided and none exists in the store, a new UUID will be generated.
         * Otherwise, the existing threadId from the store is returned.
         */
        getThreadId: (store) => {
            return (id?: string): string => {
                if (id) {
                    if (!store.threadId) {
                        store.threadId = id
                        return store.threadId
                    } else {
                        console.warn('Cannot set thread ID on already instantiated store. Create a new store instead.')
                        return store.threadId
                    }
                }

                if (!store.threadId) {
                    store.threadId = uuidv4()
                    return store.threadId
                } else {
                    return store.threadId
                }
            }
        },

        getLastAssistantMessage(store): OpeyMessage | undefined {
            return this.getMessageById(store.currentAssistantMessage.id)
        },

        getMessageById: (store) => {
            return (id: string): OpeyMessage | undefined => {
                return store.messages.find(m => m.id === id)
            }
        },

        getToolCallById: (store) => {
            return (toolCallId: string): OpeyToolCall | undefined=> {
                const allMessages = store.messages.concat(store.currentAssistantMessage) // Include the current assistant message in the search
                for (const message of allMessages) {
                    if (message.role === 'assistant') {
                        const assistantMessage = message as AssistantMessage
                        const toolCallMatch = assistantMessage.toolCalls.find(tc => tc.toolCall.id === toolCallId)
                        if (toolCallMatch) {
                            return toolCallMatch
                        }
                    }
                }

            }
        }
    },

    actions: {
        /**
         * Adds a message to the chat.
         * 
         * Works in a reducer-like fashion, updating the message if it already exists.
         * 
            * @param message - The message to add to the chat
         */
        async addMessage(message: AssistantMessage | UserMessage): Promise<void> {
            
            const existingMessage = this.messages.find(m => m.id === message.id);
            if (existingMessage) {
                // Update the existing message
                existingMessage.content = message.content;
                
            } else {
                // Add the new message
                this.messages.push(message);
            }
        },

        async removeMessage(messageId: string): Promise<void> {
            this.messages = this.messages.filter(m => m.id !== messageId);
        },

        async applyErrorToMessage(messageId: string, errorMessageString: string): Promise<void> {
            const message = this.getMessageById(messageId);
            if (message) {
                message.error = errorMessageString;
            }
        },

        async handleAuthentication(): Promise<void> {
            // Establish consent for Opey via the Explorer backend (same-origin proxy).
            // The backend (`POST /api/opey/consent`) stores the consent in the server-side
            // session (session.opeyConfig) and authenticates to Opey with the Consent-JWT on
            // every /stream call. The browser therefore never talks to Opey directly, which
            // avoids the cross-origin session-cookie problem (mirrors the Portal design).
            const consentResponse = await getobpConsent()

            if (!consentResponse) {
                throw new Error('Failed to grant consent. Please try again.')
            }

            // Consent is now stored server-side; the backend proxy handles the Opey session.
            this.userIsAuthenticated = true
        },

        async stream(input: ChatStreamInput): Promise<void> {

            // By this point, if we have not set the thread ID we should do so
            this.getThreadId()

            // Add user message to chat
            this.addMessage(input.message)

            // Create a placecholder for the assistant message
            this.currentAssistantMessage = {
                content: '',
                role: 'assistant',
                id: uuidv4(),
                toolCalls: [],
                loading: true,
            }
            this.addMessage(this.currentAssistantMessage)

            // Call the Explorer backend proxy (same-origin: browser → Vite /api → Express 8085 → Opey).
            // The backend attaches the Consent-JWT server-side, so the browser stays same-origin
            // and never hits Opey's cross-origin session cookie.
            try {
                const response = await fetch('/api/opey/stream', {
                    method: 'POST',
                    credentials: 'include',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        thread_id: this.threadId,
                        message: input.message.content,
                        is_tool_call_approval: input.message.isToolCallApproval
                    })
                })
            
                const stream = response.body;
                if (!stream) {
                    throw new Error('No stream returned from API')
                }
        
                if (response.status !== 200) {
                    switch (response.status) {
                        case 401:
                            throw new Error('Unauthorized. Please log in again.');
                    }
                    throw new Error(`Error sending Opey message: ${response.statusText}`);
                }
    
                await this._processOpeyStream(stream);
            } catch (error) {
                console.error('Error sending Opey message:', error);

                let errorMessage = "Hmmm, Looks like smething went wrong. Please try again later.";

                switch (error) {
                    case 'Unauthorized. Please log in again.':
                        errorMessage = 'You are not logged in. Please log in to continue.';
                }
                // Apply error state to the assistant message
                await this.applyErrorToMessage(this.currentAssistantMessage.id, errorMessage);

                this.status = 'ready';
                
            }
        },

        async _processOpeyStream(stream: ReadableStream<Uint8Array>): Promise<void> {
            this.status = 'streaming'
            const reader = stream.getReader();
            let decoder = new TextDecoder();
            // Holds any partial line left over from the previous chunk: chunk boundaries
            // don't align with SSE line boundaries, so a "data: {...}" frame can split
            // across two reads.
            let buffer = '';

            try {
                while (true) {
                    const { done, value } = await reader.read();

                    if (done) {
                        console.log('Stream complete');
                        this.status = 'ready';
                        break;
                    }

                    buffer += decoder.decode(value, { stream: true });
                    console.debug('Received:', buffer); //DEBUG

                    // Parse the SSE data format. Keep the last (possibly incomplete) line
                    // buffered until the next chunk instead of processing it now.
                    const lines = buffer.split('\n');
                    buffer = lines.pop() ?? '';
                    for (const line of lines) {
                        if (line.startsWith('data: ') && line !== 'data: [DONE]') {
                            try {

                                let data;
                                const jsonStr = line.substring(6); // Remove 'data: '
                                try {
                                    data = JSON.parse(jsonStr);
                                } catch (e) {
                                    console.error(`Failed to parse JSON: ${jsonStr}`);
                                    throw new Error(`Failed to parse JSON stream data: ${jsonStr}`);
                                }
                                const content: RawOpeyMessage = data.content;
                                
                                
                                // This is where we process different types of messages from Opey by their 'type' field
                                // Support both legacy ('message','tool','token') and new streaming types
                                // Pending tool calls (legacy)
                                if (data.type === 'message') {

                                    if (content.tool_approval_request) {
                                        if (!content.tool_call_id) {
                                            throw new Error('Tool call ID not found for approval request');
                                        }
                                        const awaitingApproval = this.getToolCallById(content.tool_call_id)
                                        if (!awaitingApproval) {
                                            throw new Error(`Tool call ${content.tool_call_id} not found for approval request`);
                                        }
                                        awaitingApproval.status = "awaiting_approval"



                                    } else if (content.tool_calls && content.tool_calls.length > 0) {
                                        console.log("Tool Calls: ", content)
                                        for (const toolCall of content.tool_calls) {

                                            const toolMessage: OpeyToolCall = {
                                                status: "pending",
                                                toolCall: toolCall,
                                            }

                                            this.currentAssistantMessage.toolCalls.push(toolMessage)
                                        }
                                    }
                                }

                                // Now we handle the actual messages from the completed/ failed tool calls (legacy)
                                if (data.type === 'tool') {
                                    const toolCallId = content.tool_call_id;
                                    if (!toolCallId) {
                                        throw new Error('Tool call ID not found');
                                    }

                                    console.log("Tool Message: ", toolCallId)
                                    console.log("Current Assistant Message: ", this.currentAssistantMessage)
                                    // get the tool call that the message refers to
                                    const toolMessage = this.getToolCallById(toolCallId);
                                    if (!toolMessage) {
                                        throw new Error('Tool call for this ID not found in messages');
                                    }

                                    // Update the tool message with the content
                                    if (content.tool_status && content.tool_status === 'error') {
                                        toolMessage.status = "error";
                                        toolMessage.output = content.content;
                                    } else {
                                        toolMessage.status = "success";
                                        toolMessage.output = content.content;
                                    }
                                    
                                }

                                // Assistant token streaming (legacy and new)
                                if ((data.type === 'token' || data.type === 'assistant_token') && data.content) {
                                    this.currentAssistantMessage.loading = false;
                                    // Append content to the current assistant message
                                    this.currentAssistantMessage.content += data.content;
                                    // Force Vue to detect the change
                                    this.messages = [...this.messages];
                                }

                                // Assistant final content (new API emits assistant_complete)
                                if (data.type === 'assistant_complete' && data.content) {
                                    this.currentAssistantMessage.loading = false;
                                    this.currentAssistantMessage.content += data.content;
                                    this.messages = [...this.messages];
                                }

                                // New API: Tool lifecycle events mapping to UI model
                                if (data.type === 'tool_start') {
                                    const toolMessage: OpeyToolCall = {
                                        status: 'pending',
                                        toolCall: {
                                            id: data.tool_call_id,
                                            name: data.tool_name,
                                            args: data.tool_input,
                                        }
                                    } as unknown as OpeyToolCall;
                                    this.currentAssistantMessage.toolCalls.push(toolMessage)
                                    this.messages = [...this.messages];
                                }
                                if (data.type === 'tool_end') {
                                    const toolMessage = this.getToolCallById(data.tool_call_id)
                                    if (toolMessage) {
                                        toolMessage.status = data.status === 'error' ? 'error' : 'success'
                                        toolMessage.output = data.tool_output
                                        this.messages = [...this.messages];
                                    }
                                }
                                if (data.type === 'approval_request') {
                                    // Mark awaiting approval on matched tool call if present
                                    const toolMessage = this.getToolCallById(data.tool_call_id)
                                    if (toolMessage) {
                                        toolMessage.status = 'awaiting_approval'
                                        this.messages = [...this.messages];
                                    }
                                }
                            } catch (e) {
                                throw new Error(`${e}`);
                            }
                        } else if (line === 'data: [DONE]') {
                            // Add the current assistant message to the messages list
                            // We need to check if the current assistant message is not already in the list, if it is simply update the existing message
                            await this.addMessage(this.currentAssistantMessage);
                            // Reset the current assistant message
                            this.currentAssistantMessage = {
                                id: '',
                                role: 'assistant',
                                content: '',
                                toolCalls: [],
                                loading: true,
                            };
                        }
                    }
                }
            } catch (error) {
                console.error('Stream error:', error);
                this.status = 'ready';
                throw error
            }
        }
        
    }
})