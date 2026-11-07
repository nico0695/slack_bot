import ConversationsController from '../../controller/conversations.controller'
import ConversationsServices from '../conversations.services'
import AssistantSingleShotService from '../assistantSingleShot.service'
import PersonalAssistantService from '../personalAssistant.service'
import MessageProcessor from '../messageProcessor.service'
import { RedisRepository } from '../../repositories/redis/conversations.redis'
import { roleTypes } from '../../shared/constants/openai'
import { ConversationProviders } from '../../shared/constants/conversationFlow'

const stored = new Map<string, string>()
const setMock = jest.fn(async (key: string, value: string) => {
  stored.set(key, value)
  return 'OK'
})
const getMock = jest.fn(async (key: string) => stored.get(key) ?? null)
const emitMock = jest.fn()

jest.mock('../../../../config/redisConfig', () => ({
  RedisConfig: {
    getClient: () => ({
      get: getMock,
      set: setMock,
      keys: async () => Array.from(stored.keys()).filter((key) => key.startsWith('cb_fs_')),
    }),
  },
}))
jest.mock('../../../../config/socketConfig', () => ({
  IoServer: { io: { in: () => ({ emit: emitMock }) } },
}))
jest.mock('../../../../config/slackConfig', () => ({
  connectionSlackApp: { client: { chat: { postMessage: jest.fn() } } },
}))
jest.mock('../../../../shared/middleware/auth', () => {
  const identity = (
    _target: any,
    _name: string,
    descriptor: PropertyDescriptor
  ): PropertyDescriptor => descriptor
  return { SlackAuth: identity, SlackAuthActions: identity }
})

const response = (content: string): any => ({
  role: roleTypes.assistant,
  content,
  provider: ConversationProviders.ASSISTANT,
})

beforeEach(() => {
  stored.clear()
  jest.clearAllMocks()
})

it('shares Slack DM → REST → web context while only web turns enter the web display', async () => {
  const redis = new RedisRepository()
  const ai = {
    chatCompletion: jest.fn(async (_prompt, options) =>
      response(options?.mode === 'classification' ? '{"intent":"question"}' : 'Tu alerta es #12.')
    ),
  }
  const alerts = {
    createAssistantAlert: jest.fn(async () => ({
      data: { id: 12, message: 'revisar informe', date: new Date('2999-01-01T13:00:00Z') },
    })),
    getAlertsByUserId: jest.fn(async () => ({ data: [] })),
  }
  const tasks = { getTasksByUserId: jest.fn(async () => ({ data: [] })) }
  const notes = { getNotesByUserId: jest.fn(async () => ({ data: [] })) }
  const links = { getLinksByUserId: jest.fn(async () => ({ data: [] })) }
  const processor = new MessageProcessor(
    ai as any,
    alerts as any,
    {} as any,
    tasks as any,
    notes as any,
    links as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any
  )
  const processSpy = jest.spyOn(processor, 'processAssistantMessage')
  const personal = new PersonalAssistantService(processor, redis)
  const web = new ConversationsServices(
    ai as any,
    redis,
    {} as any,
    alerts as any,
    {} as any,
    tasks as any,
    notes as any,
    links as any,
    personal,
    {} as any
  )
  const rest = new AssistantSingleShotService(personal)
  const slack = new ConversationsController(
    web,
    processor,
    { isFlowActive: async () => false } as any,
    personal
  )
  slack.userData = { id: 1 } as any
  const say = jest.fn()

  await slack.conversationFlow({
    payload: { text: '.a 10m revisar informe', user: 'U1', channel: 'D1', channel_type: 'im' },
    body: {},
    say,
  })
  expect(say).toHaveBeenCalled()
  expect(alerts.createAssistantAlert).toHaveBeenCalledWith(
    1,
    '10m',
    expect.stringMatching(/^revisar informe\s*$/),
    undefined
  )
  await rest.processMessage('rest-request', '¿qué alerta guardé?', 1)
  expect(JSON.stringify(ai.chatCompletion.mock.calls[0][0])).toContain('revisar informe')
  expect(await web.getWebAssistantHistory(1)).toEqual([])

  await web.generateAssistantConversation('¿y su número?', 1)
  const webHistory = processSpy.mock.calls[2][4] ?? []
  expect(webHistory.map((entry) => entry.content).join('\n')).toContain('¿qué alerta guardé?')
  expect(webHistory.map((entry) => entry.content).join('\n')).toContain('revisar informe')
  expect((await web.getWebAssistantHistory(1)).map((entry) => entry.content)).toEqual([
    '¿y su número?',
    'Tu alerta es #12.',
  ])
  expect(await web.getWebAssistantHistory(91)).toEqual([])
  expect(await redis.getPersonalAssistantMessages(91)).toEqual([])
  expect(await redis.getChannelsConversationFlow()).toEqual([])
  expect(emitMock).not.toHaveBeenCalled()
  expect(processSpy.mock.calls.every((call) => call[2] === undefined && !call[3])).toBe(true)
  expect(stored.has('cb_assistant_user_1')).toBe(true)
  expect(stored.has('cb_assistant_web_user_1')).toBe(true)
})

it('keeps provider-less OpenAI answers readable on reconnect and later web turns', async () => {
  const redis = new RedisRepository()
  const rawAnswer = { role: roleTypes.assistant, content: 'OpenAI answer' }
  const personal = {
    processMessage: jest.fn().mockResolvedValue({ response: rawAnswer, shouldSkipAI: false }),
  }
  const web = new ConversationsServices(
    {} as any,
    redis,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    personal as any,
    {} as any
  )
  expect((await web.generateAssistantConversation('first', 1)).response).toBe(rawAnswer)
  expect(await web.getWebAssistantHistory(1)).toEqual([
    expect.objectContaining({ role: roleTypes.user, content: 'first' }),
    { ...rawAnswer, provider: ConversationProviders.ASSISTANT },
  ])
  await web.generateAssistantConversation('second', 1)
  expect((await web.getWebAssistantHistory(1)).map((entry) => entry.content)).toEqual([
    'first',
    'OpenAI answer',
    'second',
    'OpenAI answer',
  ])
})
