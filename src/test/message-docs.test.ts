import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGet = vi.fn()
vi.mock('@/obp', () => ({
  get: (...args: any[]) => mockGet(...args),
  isServerUp: vi.fn(),
  OBP_API_VERSION: 'v5.1.0'
}))

const { getGroupedMessageDocs, getGroupedMessageDocsJsonSchema, getConnectors } = await import(
  '@/obp/message-docs'
)

describe('getGroupedMessageDocs', () => {
  it('groups message docs by adapter_implementation.group, stripping dashes', () => {
    const docs = {
      message_docs: [
        { process: 'a', adapter_implementation: { group: 'Bank-Account' } },
        { process: 'b', adapter_implementation: { group: 'Bank-Account' } },
        { process: 'c', adapter_implementation: { group: 'User ' } }
      ]
    }

    const grouped = getGroupedMessageDocs(docs)

    expect(Object.keys(grouped).sort()).toEqual(['BankAccount', 'User'])
    expect(grouped.BankAccount).toHaveLength(2)
  })
})

describe('getGroupedMessageDocsJsonSchema', () => {
  it('groups by adapter_implementation.group when a messages array is present', () => {
    const docs = {
      properties: {
        messages: {
          items: [
            { process: 'a', adapter_implementation: { group: 'Bank' }, outbound_schema: {}, inbound_schema: {} },
            { process: 'b', adapter_implementation: { group: 'Bank' }, outbound_schema: {}, inbound_schema: {} }
          ]
        }
      },
      definitions: {}
    }

    const { grouped } = getGroupedMessageDocsJsonSchema(docs)

    expect(grouped.Bank).toHaveLength(2)
  })

  it('falls back to categorizing definitions by InBound/OutBound prefix when there is no messages array', () => {
    const docs = {
      properties: {},
      definitions: {
        InBoundGetBanks: { type: 'object' },
        OutBoundGetBanks: { type: 'object' },
        SomeOtherType: { type: 'object' }
      }
    }

    const { grouped } = getGroupedMessageDocsJsonSchema(docs)

    expect(grouped['Inbound Methods']).toHaveLength(1)
    expect(grouped['Outbound Methods']).toHaveLength(1)
    expect(grouped['Uncategorized']).toHaveLength(1)
  })

  it('returns empty grouped/definitions when there is neither a messages array nor definitions', () => {
    const result = getGroupedMessageDocsJsonSchema({})
    expect(result).toEqual({ grouped: {}, definitions: {} })
  })
})

describe('getConnectors', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('excludes internal connectors (exact match and prefix match)', async () => {
    mockGet.mockResolvedValue({
      connectors: [
        { connector_name: 'mapped' },
        { connector_name: 'star' },
        { connector_name: 'rabbitmq_vOct2024' },
        { connector_name: 'internal_something' },
        { connector_name: 'rest_vMar2019' }
      ]
    })

    const connectors = await getConnectors()

    expect(connectors).toEqual(['rabbitmq_vOct2024', 'rest_vMar2019'])
  })

  it('dedupes concurrent calls into a single underlying request', async () => {
    let resolveGet: (value: any) => void
    mockGet.mockReturnValue(
      new Promise((resolve) => {
        resolveGet = resolve
      })
    )

    const first = getConnectors()
    const second = getConnectors()

    resolveGet!({ connectors: [{ connector_name: 'rest_vMar2019' }] })
    const [a, b] = await Promise.all([first, second])

    expect(mockGet).toHaveBeenCalledTimes(1)
    expect(a).toEqual(b)
  })

  it('falls back to the hardcoded list when the API call fails', async () => {
    mockGet.mockRejectedValue(new Error('network error'))

    const connectors = await getConnectors()

    expect(connectors).toEqual([
      'akka_vDec2018',
      'rest_vMar2019',
      'stored_procedure_vDec2019',
      'rabbitmq_vOct2024'
    ])
  })
})
