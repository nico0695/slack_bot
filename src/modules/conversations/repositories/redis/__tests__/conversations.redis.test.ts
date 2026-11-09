import { RedisRepository } from '../conversations.redis'

const setMock = jest.fn()
const getMock = jest.fn()
const delMock = jest.fn()
const keysMock = jest.fn()
const lRangeMock = jest.fn()
const expireMock = jest.fn()
const rPushMock = jest.fn()
const lTrimMock = jest.fn()
const execMock = jest.fn()
const multiChain = { rPush: rPushMock, lTrim: lTrimMock, exec: execMock }
const multiMock = jest.fn()
const clientState = { isReady: true as boolean | undefined }

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
      get isReady() {
        return clientState.isReady
      },
      set: setMock,
      get: getMock,
      del: delMock,
      keys: keysMock,
      lRange: lRangeMock,
      expire: expireMock,
      multi: multiMock,
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
    clientState.isReady = true
    multiMock.mockReturnValue(multiChain)
    rPushMock.mockReturnValue(multiChain)
    lTrimMock.mockReturnValue(multiChain)
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

  describe('assistant context', () => {
    const secret = 'contenido-secreto-del-usuario'
    const entries = [
      { role: 'user', content: `hola ${secret}` },
      { role: 'assistant', content: `respuesta ${secret}` },
    ] as any[]

    const expectNoWrites = (): void => {
      expect(setMock).not.toHaveBeenCalled()
      expect(delMock).not.toHaveBeenCalled()
      expect(multiMock).not.toHaveBeenCalled()
      expect(rPushMock).not.toHaveBeenCalled()
      expect(lTrimMock).not.toHaveBeenCalled()
    }

    const expectLogsWithoutContent = (): void => {
      const logged = [...mockLogFns.warn.mock.calls, ...mockLogFns.error.mock.calls]
      expect(logged.length).toBeGreaterThan(0)
      logged.forEach(([payload, message]) => {
        expect(Object.keys(payload).sort()).toEqual(['err', 'userId'])
        expect(payload.userId).toBe(7)
        expect(
          `${String(payload.err?.message)} ${String(payload.err?.stack)} ${String(message)}`
        ).not.toContain(secret)
      })
    }

    it('reads the last entries of the list', async () => {
      lRangeMock.mockResolvedValue(entries.map((entry) => JSON.stringify(entry)))

      const result = await repository.getAssistantContext(7)

      expect(result).toEqual(entries)
      expect(lRangeMock).toHaveBeenCalledWith('cb_actx_7', -6, -1)
      expect(mockLogFns.warn).not.toHaveBeenCalled()
      expectNoWrites()
    })

    it('returns an empty context when the key does not exist', async () => {
      lRangeMock.mockResolvedValue([])

      expect(await repository.getAssistantContext(7)).toEqual([])
      expect(mockLogFns.warn).not.toHaveBeenCalled()
    })

    it('returns [] without writing when the read throws', async () => {
      lRangeMock.mockRejectedValue(
        new Error('WRONGTYPE Operation against a key holding the wrong kind of value')
      )

      const result = await repository.getAssistantContext(7)

      expect(result).toEqual([])
      expect(mockLogFns.warn).toHaveBeenCalledTimes(1)
      expectNoWrites()
      expectLogsWithoutContent()
    })

    it('returns [] without writing when an item is corrupt JSON', async () => {
      lRangeMock.mockResolvedValue([
        JSON.stringify(entries[0]),
        `{"role":"user","content":"${secret}`,
      ])

      const result = await repository.getAssistantContext(7)

      expect(result).toEqual([])
      expectNoWrites()
      expectLogsWithoutContent()
    })

    it.each([
      ['unknown role', { role: 'system', content: secret }],
      ['non-string content', { role: 'user', content: { text: secret } }],
      ['missing content', { role: 'assistant' }],
      ['null item', null],
      ['plain string', secret],
    ])('returns [] without writing when an item has the wrong shape (%s)', async (_name, bad) => {
      lRangeMock.mockResolvedValue([JSON.stringify(entries[0]), JSON.stringify(bad)])

      const result = await repository.getAssistantContext(7)

      expect(result).toEqual([])
      expectNoWrites()
      expectLogsWithoutContent()
    })

    it('appends both entries and trims in a single transaction without TTL', async () => {
      execMock.mockResolvedValue([2, 'OK'])

      const result = await repository.appendAssistantContext(7, entries)

      expect(result).toBe(true)
      expect(multiMock).toHaveBeenCalledTimes(1)
      expect(rPushMock).toHaveBeenCalledTimes(1)
      expect(rPushMock).toHaveBeenCalledWith(
        'cb_actx_7',
        entries.map((entry) => JSON.stringify(entry))
      )
      expect(lTrimMock).toHaveBeenCalledTimes(1)
      expect(lTrimMock).toHaveBeenCalledWith('cb_actx_7', -6, -1)
      expect(rPushMock.mock.invocationCallOrder[0]).toBeLessThan(
        lTrimMock.mock.invocationCallOrder[0]
      )
      expect(execMock).toHaveBeenCalledTimes(1)
      // No prior read, no TTL
      expect(lRangeMock).not.toHaveBeenCalled()
      expect(getMock).not.toHaveBeenCalled()
      expect(setMock).not.toHaveBeenCalled()
      expect(expireMock).not.toHaveBeenCalled()
    })

    it('returns false without throwing when the transaction rejects', async () => {
      execMock.mockRejectedValue(new Error('connection lost'))

      await expect(repository.appendAssistantContext(7, entries)).resolves.toBe(false)
      expect(execMock).toHaveBeenCalledTimes(1)
      expectLogsWithoutContent()
    })

    it('returns false when a command inside the transaction fails', async () => {
      execMock.mockResolvedValue([new Error('WRONGTYPE Operation against a key'), 'OK'])

      await expect(repository.appendAssistantContext(7, entries)).resolves.toBe(false)
      expect(execMock).toHaveBeenCalledTimes(1)
      expectLogsWithoutContent()
    })

    it('does not touch redis when there are no entries', async () => {
      const result = await repository.appendAssistantContext(7, [])

      expect(result).toBe(true)
      expect(multiMock).not.toHaveBeenCalled()
      expect(execMock).not.toHaveBeenCalled()
      expect(lRangeMock).not.toHaveBeenCalled()
    })
    describe('when redis is unavailable', () => {
      const expectUserIdOnlyLogs = (): void => {
        const logged = [...mockLogFns.warn.mock.calls, ...mockLogFns.error.mock.calls]
        expect(logged).toHaveLength(1)
        expect(logged[0][0]).toEqual({ userId: 7 })
      }

      afterEach(() => {
        jest.useRealTimers()
      })

      it.each([
        ['false', false],
        ['undefined', undefined],
      ])('reads [] without issuing a command when isReady is %s', async (_name, isReady) => {
        clientState.isReady = isReady
        lRangeMock.mockReturnValue(new Promise(() => undefined))

        await expect(repository.getAssistantContext(7)).resolves.toEqual([])

        expect(lRangeMock).not.toHaveBeenCalled()
        expectUserIdOnlyLogs()
      })

      it('does not append nor issue a command when the client is not ready', async () => {
        clientState.isReady = false
        execMock.mockReturnValue(new Promise(() => undefined))

        await expect(repository.appendAssistantContext(7, entries)).resolves.toBe(false)

        expect(multiMock).not.toHaveBeenCalled()
        expect(execMock).not.toHaveBeenCalled()
        expectUserIdOnlyLogs()
      })

      it('reads [] after the timeout when the command never settles', async () => {
        jest.useFakeTimers()
        lRangeMock.mockReturnValue(new Promise(() => undefined))
        const settled = jest.fn()

        const pending = repository.getAssistantContext(7).then((result) => {
          settled(result)
          return result
        })

        await jest.advanceTimersByTimeAsync(499)
        expect(settled).not.toHaveBeenCalled()

        await jest.advanceTimersByTimeAsync(1)
        await expect(pending).resolves.toEqual([])
        expect(lRangeMock).toHaveBeenCalledTimes(1)
        expectUserIdOnlyLogs()
      })

      it('returns false after the timeout when the transaction never settles', async () => {
        jest.useFakeTimers()
        execMock.mockReturnValue(new Promise(() => undefined))
        const settled = jest.fn()

        const pending = repository.appendAssistantContext(7, entries).then((result) => {
          settled(result)
          return result
        })

        await jest.advanceTimersByTimeAsync(499)
        expect(settled).not.toHaveBeenCalled()

        await jest.advanceTimersByTimeAsync(1)
        await expect(pending).resolves.toBe(false)
        expect(execMock).toHaveBeenCalledTimes(1)
        expectUserIdOnlyLogs()
      })

      it('swallows a late rejection of a command abandoned by the timeout', async () => {
        jest.useFakeTimers()
        let rejectCommand: (error: Error) => void = () => undefined
        lRangeMock.mockReturnValue(
          new Promise((_resolve, reject) => {
            rejectCommand = reject
          })
        )
        const onUnhandled = jest.fn()
        process.on('unhandledRejection', onUnhandled)

        try {
          const pending = repository.getAssistantContext(7)
          await jest.advanceTimersByTimeAsync(500)
          await expect(pending).resolves.toEqual([])

          rejectCommand(new Error('The client is closed'))
          jest.useRealTimers()
          await new Promise((resolve) => setImmediate(resolve))
          await new Promise((resolve) => setImmediate(resolve))

          expect(onUnhandled).not.toHaveBeenCalled()
          expect(mockLogFns.warn).toHaveBeenCalledTimes(1)
        } finally {
          process.off('unhandledRejection', onUnhandled)
        }
      })

      it('clears the timer when the command settles in time', async () => {
        jest.useFakeTimers()
        lRangeMock.mockResolvedValue([])
        execMock.mockResolvedValue([2, 'OK'])

        await repository.getAssistantContext(7)
        await repository.appendAssistantContext(7, entries)

        expect(jest.getTimerCount()).toBe(0)
      })
    })
  })
})
