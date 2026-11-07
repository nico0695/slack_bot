import ConversationsWebController from '../conversationsWeb.controller'
import { getAuthenticatedUser } from '../../../../shared/middleware/auth'
import { Profiles } from '../../../../shared/constants/auth.constants'

jest.mock('../../../../shared/middleware/auth', () => ({
  HttpAuth: (_target: any, _key: string, descriptor: PropertyDescriptor) => descriptor,
  Permission: () => (_target: any, _key: string, descriptor: PropertyDescriptor) => descriptor,
  getAuthenticatedUser: jest.fn(),
}))

const authenticate = getAuthenticatedUser as jest.Mock
const deferred = (): { promise: Promise<void>; resolve: () => void } => {
  let release!: () => void
  const promise = new Promise<void>((resolve) => {
    release = resolve
  })
  return { promise, resolve: release }
}

describe('authenticated assistant socket events', () => {
  let handlers: Record<string, (...args: any[]) => any>
  let socket: { connected: boolean; on: jest.Mock; emit: jest.Mock }
  let services: { getWebAssistantHistory: jest.Mock; generateAssistantConversation: jest.Mock }
  const response = { role: 'assistant', content: 'listo', provider: 'assistant' }

  beforeEach(() => {
    jest.resetAllMocks()
    handlers = {}
    socket = {
      connected: true,
      on: jest.fn((name, handler) => {
        handlers[name] = handler
      }),
      emit: jest.fn(),
    }
    authenticate.mockImplementation(async (token) => {
      if (token !== 'valid' && token !== 'other') throw new Error('private auth detail')
      return { id: token === 'valid' ? 42 : 91, enabled: true, profile: Profiles.USER }
    })
    services = {
      getWebAssistantHistory: jest.fn().mockResolvedValue([]),
      generateAssistantConversation: jest.fn().mockResolvedValue({ response, skipped: false }),
    }
    const controller = new ConversationsWebController(services as any, {} as any, {} as any)
    controller.registerAssistantSocket(socket as any)
  })

  const join = async (): Promise<void> => handlers.join_assistant_room({ accessToken: 'valid' })

  it('loads only verified web history and ignores forged user/room fields', async () => {
    await handlers.join_assistant_room({ accessToken: 'valid', userId: 91, channel: '99999991' })
    expect(services.getWebAssistantHistory).toHaveBeenCalledWith(42)
    expect(socket.emit).toHaveBeenCalledWith('join_assistant_response', {
      message: 'Conversación iniciada',
      conversation: [],
    })
    const ack = jest.fn()
    await handlers.send_assistant_message(
      { accessToken: 'valid', userId: 91, message: ' hola ' },
      ack
    )
    expect(services.generateAssistantConversation).toHaveBeenCalledWith(
      'hola',
      42,
      expect.any(Function)
    )
    expect(socket.emit).toHaveBeenCalledWith('receive_assistant_message', response)
    expect(ack).toHaveBeenCalledWith({ ok: true, skipped: false })
  })

  it.each([undefined, '', 'invalid'])(
    'rejects missing or invalid tokens: %s',
    async (accessToken) => {
      await handlers.join_assistant_room({ accessToken })
      await handlers.send_assistant_message({ accessToken, message: 'hola', userId: 42 }, jest.fn())
      expect(services.getWebAssistantHistory).not.toHaveBeenCalled()
      expect(services.generateAssistantConversation).not.toHaveBeenCalled()
      expect(JSON.stringify(socket.emit.mock.calls)).not.toContain('private auth detail')
    }
  )

  it('does not execute a send without a verified join', async () => {
    await handlers.send_assistant_message({ accessToken: 'valid', message: 'hola' }, jest.fn())
    expect(services.generateAssistantConversation).not.toHaveBeenCalled()
  })

  it('checks the profile and validates again for every send', async () => {
    await join()
    authenticate.mockResolvedValue({ id: 42, enabled: true, profile: 999 })
    await handlers.send_assistant_message({ accessToken: 'valid', message: 'hola' }, jest.fn())
    expect(services.generateAssistantConversation).not.toHaveBeenCalled()
    expect(authenticate).toHaveBeenCalledTimes(2)
  })

  it('rejects changing identity through a send payload', async () => {
    await join()
    await handlers.send_assistant_message({ accessToken: 'other', message: 'hola' }, jest.fn())
    expect(services.generateAssistantConversation).not.toHaveBeenCalled()
  })

  it('acknowledges skips without emitting a new response', async () => {
    await join()
    socket.emit.mockClear()
    services.generateAssistantConversation.mockResolvedValue({ response: null, skipped: true })
    const ack = jest.fn()
    await handlers.send_assistant_message({ accessToken: 'valid', message: '+hola' }, ack)
    expect(socket.emit).not.toHaveBeenCalled()
    expect(ack).toHaveBeenCalledWith({ ok: true, skipped: true })
  })

  it('clears client busy state on an unconfirmed result or thrown error', async () => {
    await join()
    const ack = jest.fn()
    services.generateAssistantConversation.mockResolvedValueOnce({ response: null, skipped: false })
    await handlers.send_assistant_message({ accessToken: 'valid', message: 'one' }, ack)
    services.generateAssistantConversation.mockRejectedValueOnce(
      new Error('private processing detail')
    )
    await handlers.send_assistant_message({ accessToken: 'valid', message: 'two' }, ack)
    expect(ack.mock.calls).toEqual([[{ ok: false, skipped: false }], [{ ok: false }]])
    expect(JSON.stringify(socket.emit.mock.calls)).not.toContain('private processing detail')
  })

  it.each(['leave_assistant_room', 'disconnect'])(
    'suppresses old progress and answers after %s without retrying the action',
    async (event) => {
      await join()
      const started = deferred()
      const finish = deferred()
      let progress!: (message: string) => void
      services.generateAssistantConversation.mockImplementation(
        async (_message, _user, callback) => {
          progress = callback
          started.resolve()
          await finish.promise
          return { response, skipped: false }
        }
      )
      const ack = jest.fn()
      const pending = handlers.send_assistant_message(
        { accessToken: 'valid', message: 'hola' },
        ack
      )
      await started.promise
      handlers[event]()
      socket.emit.mockClear()
      progress('old account progress')
      finish.resolve()
      await pending
      expect(socket.emit).not.toHaveBeenCalled()
      expect(ack).not.toHaveBeenCalled()
      expect(services.generateAssistantConversation).toHaveBeenCalledTimes(1)
    }
  )

  it('does not emit a history load from before logout', async () => {
    const finish = deferred()
    services.getWebAssistantHistory.mockImplementation(async () => {
      await finish.promise
      return []
    })
    const pending = join()
    await Promise.resolve()
    await Promise.resolve()
    handlers.leave_assistant_room()
    finish.resolve()
    await pending
    expect(socket.emit).not.toHaveBeenCalled()
  })
})
