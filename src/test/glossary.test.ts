import { describe, it, expect } from 'vitest'
import { getGlossaryItemByTitle } from '@/obp/glossary'

describe('getGlossaryItemByTitle', () => {
  const glossary = {
    glossary_items: [
      { title: 'Consent', description: { html: '<p>...</p>' } },
      { title: 'API-Explorer-II-Help', description: { html: '<p>help</p>' } }
    ]
  }

  it('returns the matching item by title', () => {
    expect(getGlossaryItemByTitle(glossary, 'Consent')).toEqual(glossary.glossary_items[0])
  })

  it('returns null when no item matches', () => {
    expect(getGlossaryItemByTitle(glossary, 'Nonexistent')).toBeNull()
  })

  it('returns null when glossary is undefined', () => {
    expect(getGlossaryItemByTitle(undefined, 'Consent')).toBeNull()
  })

  it('returns null when glossary_items is missing (e.g. an {error} object)', () => {
    expect(getGlossaryItemByTitle({ error: 'failed to load' }, 'Consent')).toBeNull()
  })
})
