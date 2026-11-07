import { RedisRepository } from '../conversations.redis'

const setMock = jest.fn()
const getMock = jest.fn()
const delMock = jest.fn()
const keysMock = jest.fn()

const mockLogFns = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
  fatal: jest.fn(),
}

jest.mock('../../../../../config/logger', () => ({
  createModuleLogger: jest.fn().mockReturnValue({
    info: (...args: any[]) => mockLogFns.info(...args),
    error: (...args: any[]) => mockLogFns.error(...args),
    warn: (...args: any[]) => mockLogFns.warn(...args),
    debug: (...args: any[]) => mockLogFns.debug(...args),
    fatal: (...args: any[]) => mockLogFns.fatal(...args),
  }),
}))

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
    repository = new RedisRepository()
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

  it('returns null without logging an error when conversation key does not exist', async () => {
    getMock.mockResolvedValue(null)

    const result = await repository.getConversationMessages('key')

    expect(result).toBeNull()
    expect(mockLogFns.error).not.toHaveBeenCalled()
  })

  it('returns null without logging an error when conversation flow does not exist', async () => {
    getMock.mockResolvedValue(null)

    const result = await repository.getConversationFlow('channel-1')

    expect(result).toBeNull()
    expect(mockLogFns.error).not.toHaveBeenCalled()
  })

  it('saves alert snooze config with expiration', async () => {
    setMock.mockResolvedValue('OK')

    const config = { defaultSnoozeMinutes: 10 }
    const result = await repository.saveAlertSnoozeConfig(5, config)

    expect(result).toBe(true)
    expect(setMock).toHaveBeenCalledWith(
      'cb_alert_snooze_5',
      JSON.stringify(config),
      expect.objectContaining({ EX: expect.any(Number) })
    )
  })

  it('returns null when alert snooze config not stored', async () => {
    getMock.mockResolvedValue(null)

    const result = await repository.getAlertSnoozeConfig(5)

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

  describe('personal assistant history', () => {
    const history = [
      { role: 'user', content: 'question', provider: 'assistant' },
      { role: 'assistant', content: 'answer', provider: 'assistant' },
    ]

    it('distinguishes missing history from an unavailable read', async () => {
      getMock.mockResolvedValueOnce(null).mockRejectedValueOnce(new Error('private data'))
      expect(await repository.getPersonalAssistantMessages(1)).toEqual([])
      expect(await repository.getPersonalAssistantMessages(1)).toBeNull()
      expect(getMock).toHaveBeenCalledWith('cb_assistant_user_1')
      expect(mockLogFns.warn).toHaveBeenCalledWith('Personal assistant history is unavailable')
    })

    it.each([
      'invalid json',
      '{}',
      '[null]',
      '[{"role":"system","content":"x","provider":"assistant"}]',
      '[{"role":"user","content":1,"provider":"assistant"}]',
    ])('treats corrupt history as unavailable: %s', async (raw) => {
      getMock.mockResolvedValue(raw)
      expect(await repository.getPersonalAssistantMessages(1)).toBeNull()
    })

    it('reads valid history and strips unrelated metadata', async () => {
      getMock.mockResolvedValue(
        JSON.stringify(history.map((entry) => ({ ...entry, contentBlock: { blocks: [] } })))
      )
      expect(await repository.getPersonalAssistantMessages(91)).toEqual(history)
      expect(getMock).toHaveBeenCalledWith('cb_assistant_user_91')
    })

    it('saves just role, content, provider with no expiration', async () => {
      setMock.mockResolvedValue('OK')
      expect(
        await repository.savePersonalAssistantMessages(
          1,
          history.map((entry) => ({
            ...entry,
            plainText: 'unused',
            contentBlock: { blocks: [] },
          })) as any
        )
      ).toBe(true)
      expect(setMock).toHaveBeenCalledWith('cb_assistant_user_1', JSON.stringify(history))
      expect(setMock.mock.calls[0]).toHaveLength(2)
    })

    it('returns false for write failures without logging private error details', async () => {
      setMock.mockRejectedValue(new Error('private data'))
      expect(await repository.savePersonalAssistantMessages(1, [])).toBe(false)
      expect(mockLogFns.warn).toHaveBeenCalledWith('Personal assistant history could not be saved')
    })
  })
})
