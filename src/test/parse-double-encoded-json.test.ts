import { describe, it, expect } from 'vitest'
import { parseDoubleEncodedJson } from '@/utils/parse-double-encoded-json'

describe('parseDoubleEncodedJson', () => {
  it('parses a double-encoded JSON string into its object form', () => {
    const doubleEncoded = JSON.stringify({ a: 1, nested: { b: 'two' } })
    expect(parseDoubleEncodedJson(doubleEncoded)).toEqual({ a: 1, nested: { b: 'two' } })
  })

  it('unwraps triple (or deeper) encoding recursively', () => {
    const inner = { deep: true }
    const tripleEncoded = JSON.stringify(JSON.stringify(inner))
    expect(parseDoubleEncodedJson(tripleEncoded)).toEqual(inner)
  })

  it('parses encoded strings nested inside objects and arrays', () => {
    const payload = {
      plain: 'hello',
      embedded: JSON.stringify({ x: 1 }),
      list: [JSON.stringify([1, 2, 3]), 'not json']
    }

    expect(parseDoubleEncodedJson(payload)).toEqual({
      plain: 'hello',
      embedded: { x: 1 },
      list: [[1, 2, 3], 'not json']
    })
  })

  it('leaves non-JSON strings untouched', () => {
    expect(parseDoubleEncodedJson('just a sentence')).toBe('just a sentence')
    expect(parseDoubleEncodedJson('{broken json')).toBe('{broken json')
    expect(parseDoubleEncodedJson('')).toBe('')
  })

  it('passes through null, undefined, numbers and booleans as-is', () => {
    expect(parseDoubleEncodedJson(null)).toBeNull()
    expect(parseDoubleEncodedJson(undefined)).toBeUndefined()
    expect(parseDoubleEncodedJson(42)).toBe(42)
    expect(parseDoubleEncodedJson(false)).toBe(false)
  })
})
