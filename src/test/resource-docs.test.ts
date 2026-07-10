import { describe, it, expect } from 'vitest'
import {
  getGroupedResourceDocs,
  getFilteredGroupedResourceDocs,
  getOperationDetails
} from '@/obp/resource-docs'

const docs = {
  'OBPv5.1.0': {
    resource_docs: [
      { operation_id: 'op-1', tags: ['Bank'] },
      { operation_id: 'op-2', tags: ['Bank', 'Account'] },
      { operation_id: 'op-3', tags: ['Account'] }
    ]
  }
}

describe('getGroupedResourceDocs', () => {
  it('groups resource docs by their first tag', async () => {
    const grouped = await getGroupedResourceDocs('OBPv5.1.0', docs)
    expect(Object.keys(grouped).sort()).toEqual(['Account', 'Bank'])
    expect(grouped.Bank).toHaveLength(2)
    expect(grouped.Account).toHaveLength(1)
  })

  it('returns an empty object when the version is undefined', async () => {
    expect(await getGroupedResourceDocs(undefined as any, docs)).toEqual({})
  })

  it('returns an empty object when docs is undefined', async () => {
    expect(await getGroupedResourceDocs('OBPv5.1.0', undefined)).toEqual({})
  })

  it('returns an empty object when the requested version is not in docs', async () => {
    expect(await getGroupedResourceDocs('OBPv999.0.0', docs)).toEqual({})
  })
})

describe('getFilteredGroupedResourceDocs', () => {
  it('filters to docs matching any of the given tags, then groups by first tag', async () => {
    const grouped = await getFilteredGroupedResourceDocs('OBPv5.1.0', 'Account', docs)
    // op-2 and op-3 both have the Account tag; op-1 does not.
    expect(grouped.Bank).toHaveLength(1) // op-2, first tag is Bank
    expect(grouped.Account).toHaveLength(1) // op-3, first tag is Account
    expect(grouped.Bank?.[0].operation_id).toBe('op-2')
  })

  it('returns an empty object when the version is not in docs', async () => {
    expect(await getFilteredGroupedResourceDocs('missing', 'Bank', docs)).toEqual({})
  })
})

describe('getOperationDetails', () => {
  it('returns the doc matching the operation_id', () => {
    expect(getOperationDetails('OBPv5.1.0', 'op-2', docs)).toEqual(docs['OBPv5.1.0'].resource_docs[1])
  })

  it('returns undefined when the operation_id does not exist', () => {
    expect(getOperationDetails('OBPv5.1.0', 'no-such-op', docs)).toBeUndefined()
  })

  it('returns undefined when the version does not exist', () => {
    expect(getOperationDetails('missing', 'op-1', docs)).toBeUndefined()
  })
})
