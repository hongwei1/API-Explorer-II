// Shared setup for server unit tests (vitest.server.config.js).
//
// typedi's @Service decorator needs reflect-metadata before any service class
// is imported, and several service constructors fail fast on missing env vars
// (e.g. OBPClientService throws without VITE_OBP_API_HOST). Provide harmless
// test defaults so unit tests can instantiate services without a real stack;
// individual tests can still override any of these.
import 'reflect-metadata'

process.env.VITE_OBP_API_HOST ??= 'http://obp.test:8080'
process.env.VITE_OBP_API_VERSION ??= 'v5.1.0'
process.env.VITE_OBP_SERVER_SESSION_PASSWORD ??= 'test-session-secret'
process.env.VITE_CHATBOT_URL ??= 'http://opey.test:5000'
process.env.VITE_OPEY_CONSUMER_ID ??= 'test-opey-consumer-id'
