import { RedisRepository } from '../conversations.redis'

const setMock = jest.fn()
const getMock = jest.fn()
const delMock = jest.fn()
const keysMock = jest.fn()

jest.mock('../../../../../config/redisConfig', () => ({
  RedisConfig: {
    getClient: () => ({
      set: setMock,
      get: getMock,
      del: delMock,
      keys: keysMock,
    }),
  },
}))

describe('RedisRepository', () => {
  let repository: RedisRepository

  beforeAll(() => {
    repository = RedisRepository.getInstance()
  })

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('saves conversation messages as JSON string', async () => {
    setMock.mockResolvedValue('OK')

    const result = await repository.saveConversationMessages('key', [{ role: 'user' } as any])

    expect(result).toBe(true)
    expect(setMock).toHaveBeenCalledWith('key', JSON.stringify([{ role: 'user' }]))
  })

  it('returns false when saveConversationMessages throws', async () => {
    setMock.mockRejectedValue(new Error('fail'))

    const result = await repository.saveConversationMessages('key', [])

    expect(result).toBe(false)
  })

  it('persists conversation flow state', async () => {
    setMock.mockResolvedValue('OK')
    const flow = {
      conversation: [] as any[],
    }

    const result = await repository.saveConversationFlow('channel-1', flow as any)

    expect(result).toBe(true)
    expect(setMock).toHaveBeenCalledWith('cb_fs_channel-1', JSON.stringify(flow))
  })

  it('reads conversation messages filtering null entries', async () => {
    getMock.mockResolvedValue(JSON.stringify([{ role: 'user' }, null, { role: 'assistant' }]))

    const result = await repository.getConversationMessages('key')

    expect(result).toEqual([{ role: 'user' }, { role: 'assistant' }])
  })

  it('retrieves conversation flow removing null messages', async () => {
    getMock.mockResolvedValue(
      JSON.stringify({ conversation: [{ role: 'user' }, null, { role: 'assistant' }] })
    )

    const result = await repository.getConversationFlow('channel-1')

    expect(result?.conversation).toEqual([{ role: 'user' }, { role: 'assistant' }])
  })

  it('returns null when getConversationMessages fails', async () => {
    getMock.mockRejectedValue(new Error('fail'))

    const result = await repository.getConversationMessages('key')

    expect(result).toBeNull()
  })

  it('saves assistant preferences with expiration', async () => {
    setMock.mockResolvedValue('OK')

    const prefs = { alertDefaultSnoozeMinutes: 10 }
    const result = await repository.saveAssistantPreferences(5, prefs as any)

    expect(result).toBe(true)
    expect(setMock).toHaveBeenCalledWith(
      'cb_assistant_prefs_5',
      JSON.stringify(prefs),
      expect.objectContaining({ EX: expect.any(Number) })
    )
  })

  it('returns null when assistant preferences not stored', async () => {
    getMock.mockResolvedValue(null)

    const result = await repository.getAssistantPreferences(5)

    expect(result).toBeNull()
  })

  it('saves alert metadata merging existing payload', async () => {
    getMock.mockResolvedValueOnce(JSON.stringify({ existing: true }))
    setMock.mockResolvedValue('OK')

    const result = await repository.saveAlertMetadata(7, { snoozedUntil: 'now' } as any)

    expect(result).toBe(true)
    const payload = setMock.mock.calls[0][1]
    expect(JSON.parse(payload)).toEqual({ existing: true, snoozedUntil: 'now' })
  })

  it('returns null when getAlertMetadata has no value', async () => {
    getMock.mockResolvedValue(null)

    const result = await repository.getAlertMetadata(3)

    expect(result).toBeNull()
  })

  it('retrieves channel list from redis', async () => {
    keysMock.mockResolvedValue(['cb_fs_channel-1'])

    const result = await repository.getChannelsConversationFlow()

    expect(result).toEqual(['cb_fs_channel-1'])
  })

  it('returns null when getChannelsConversationFlow fails', async () => {
    keysMock.mockRejectedValue(new Error('fail'))

    const result = await repository.getChannelsConversationFlow()

    expect(result).toBeNull()
  })

  it('deletes conversation flow by channel', async () => {
    delMock.mockResolvedValue(1 as any)

    const result = await repository.deleteConversationFlow('channel-1')

    expect(result).toBe(true)
    expect(delMock).toHaveBeenCalledWith('cb_fs_channel-1')
  })
})
