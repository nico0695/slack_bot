import SearchRepository from '../search.repository'

const fetchMock = jest.fn()

describe('SearchRepository', () => {
  let repository: SearchRepository

  beforeAll(() => {
    global.fetch = fetchMock as any
    process.env.SEARCH_API_KEY = 'api'
    process.env.SEARCH_API_KEY_CX = 'cx'
    repository = SearchRepository.getInstance()
  })

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('returns fallback message when query empty', async () => {
    const result = await repository.search(' ')

    expect(result).toBe('No se encontró información relevante.')
  })

  it('compresses search results into plain text', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [
          { title: 'Item 1', snippet: 'Snippet 1', link: 'https://example.com/1' },
          { title: 'Item 2', snippet: 'Snippet 2', link: 'https://example.com/2' },
        ],
      }),
    })

    const result = await repository.search('status')

    expect(fetchMock).toHaveBeenCalled()
    expect(result).toContain('Item 1')
    expect(result).toContain('Snippet 2')
  })

  it('returns empty list when raw search fails', async () => {
    fetchMock.mockRejectedValue(new Error('network fail'))

    const result = await repository.searchRaw('status')

    expect(result).toEqual([])
  })

  it('builds condensed context string', () => {
    const context = repository.buildCondensedContext([
      { title: 'A', snippet: 'B', url: 'C' },
    ])

    expect(context).toContain('(1) A')
    expect(context).toContain('B')
    expect(context).toContain('C')
  })
})
