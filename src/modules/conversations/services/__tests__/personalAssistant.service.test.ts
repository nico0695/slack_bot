import 'reflect-metadata'
import { container } from 'tsyringe'
import PersonalAssistantService from '../personalAssistant.service'
import MessageProcessor from '../messageProcessor.service'
import { RedisRepository } from '../../repositories/redis/conversations.redis'
import { ConversationProviders } from '../../shared/constants/conversationFlow'
import { roleTypes } from '../../shared/constants/openai'
import { IConversation } from '../../shared/interfaces/converstions'

jest.mock('../messageProcessor.service', () => ({ __esModule: true, default: class {} }))
jest.mock('../../repositories/redis/conversations.redis', () => ({ RedisRepository: class {} }))

const entry = (content: string, role = roleTypes.assistant): IConversation => ({
  role,
  content,
  provider: ConversationProviders.ASSISTANT,
})
const deferred = (): { promise: Promise<void>; resolve: () => void } => {
  let release!: () => void
  const promise = new Promise<void>((resolve) => {
    release = resolve
  })
  return { promise, resolve: release }
}

describe('PersonalAssistantService', () => {
  let service: PersonalAssistantService
  let processor: { shouldSkipAI: jest.Mock; processAssistantMessage: jest.Mock }
  let redis: { getPersonalAssistantMessages: jest.Mock; savePersonalAssistantMessages: jest.Mock }
  let histories: Map<number, IConversation[]>

  beforeEach(() => {
    histories = new Map()
    processor = {
      shouldSkipAI: jest.fn((message: string) => message.trim().startsWith('+')),
      processAssistantMessage: jest.fn(async (message: string) => ({
        response: entry(`answer ${message}`),
        shouldSkipAI: false,
      })),
    }
    redis = {
      getPersonalAssistantMessages: jest.fn(async (id: number) => histories.get(id) ?? []),
      savePersonalAssistantMessages: jest.fn(async (id: number, history: IConversation[]) => {
        histories.set(id, history)
        return true
      }),
    }
    service = new PersonalAssistantService(processor as any, redis as any)
  })

  it('shares one singleton between DI consumers', () => {
    container.registerInstance(MessageProcessor, processor as any)
    container.registerInstance(RedisRepository, redis as any)
    expect(container.resolve(PersonalAssistantService)).toBe(
      container.resolve(PersonalAssistantService)
    )
    container.clearInstances()
  })

  it('keeps distinct internal users isolated and retains six total entries', async () => {
    await service.processMessage('one', 1)
    await service.processMessage('private', 91)
    await service.processMessage('two', 1)
    await service.processMessage('three', 1)
    await service.processMessage('four', 1)
    expect(histories.get(1)?.map(({ content }) => content)).toEqual([
      'two',
      'answer two',
      'three',
      'answer three',
      'four',
      'answer four',
    ])
    expect(histories.get(91)?.map(({ content }) => content)).toEqual(['private', 'answer private'])
    expect(processor.processAssistantMessage.mock.calls[1][4]).toEqual([])
  })

  it('passes raw processing options and progress callback', async () => {
    const progress = jest.fn()
    await service.processMessage('one', 1, progress)
    expect(processor.processAssistantMessage).toHaveBeenCalledWith(
      'one',
      1,
      undefined,
      false,
      [],
      progress
    )
  })

  it('skips plus messages without reading, writing, or processing', async () => {
    expect(await service.processMessage(' +skip', 1)).toEqual({
      response: null,
      shouldSkipAI: true,
    })
    expect(redis.getPersonalAssistantMessages).not.toHaveBeenCalled()
    expect(redis.savePersonalAssistantMessages).not.toHaveBeenCalled()
    expect(processor.processAssistantMessage).not.toHaveBeenCalled()
  })

  it.each([null, { ...entry(''), plainText: '' }])(
    'does not save empty or missing responses: %s',
    async (response) => {
      processor.processAssistantMessage.mockResolvedValue({ response, shouldSkipAI: false })
      await service.processMessage('one', 1)
      expect(redis.savePersonalAssistantMessages).not.toHaveBeenCalled()
    }
  )

  it('keeps plain normalized summaries and no binary or blocks', async () => {
    processor.processAssistantMessage.mockResolvedValue({
      response: {
        ...entry('data:image/png;base64,aW1hZ2U='),
        plainText: '*QR* creado 😀 data:image/png;base64,aW1hZ2U=',
        contentOmitted: true,
        contentBlock: { blocks: [{ type: 'image' }] },
      },
      shouldSkipAI: false,
    })
    await service.processMessage('*Generate* <https://example.com|image>', 1)
    expect(histories.get(1)).toEqual([
      entry('Generate image: https://example.com', roleTypes.user),
      entry('QR creado'),
    ])
  })

  it('omits binary-only responses', async () => {
    processor.processAssistantMessage.mockResolvedValue({
      response: { ...entry('iVBORw0KGgoabc'), contentOmitted: true },
      shouldSkipAI: false,
    })
    await service.processMessage('image', 1)
    expect(redis.savePersonalAssistantMessages).not.toHaveBeenCalled()
  })

  it('caps entries at 2000 Unicode code points without REST truncation notices', async () => {
    processor.processAssistantMessage.mockResolvedValue({
      response: entry('𐐀'.repeat(2100)),
      shouldSkipAI: false,
    })
    await service.processMessage('x'.repeat(2100), 1)
    expect(histories.get(1)?.map(({ content }) => Array.from(content).length)).toEqual([2000, 2000])
    expect(histories.get(1)?.[1].content).toBe('𐐀'.repeat(2000))
  })

  it.each(['null', 'reject'])(
    'processes without context and never overwrites unavailable history: %s',
    async (mode) => {
      if (mode === 'null') redis.getPersonalAssistantMessages.mockResolvedValue(null)
      else redis.getPersonalAssistantMessages.mockRejectedValue(new Error('private redis failure'))
      await service.processMessage('one', 1)
      expect(processor.processAssistantMessage).toHaveBeenCalledWith(
        'one',
        1,
        undefined,
        false,
        undefined,
        undefined
      )
      expect(redis.savePersonalAssistantMessages).not.toHaveBeenCalled()
    }
  )

  it.each(['false', 'reject'])(
    'returns the exact result despite failed persistence: %s',
    async (mode) => {
      const result = { response: entry('done'), shouldSkipAI: false }
      processor.processAssistantMessage.mockResolvedValue(result)
      if (mode === 'false') redis.savePersonalAssistantMessages.mockResolvedValue(false)
      else redis.savePersonalAssistantMessages.mockRejectedValue(new Error('private redis failure'))
      expect(await service.processMessage('one', 1)).toBe(result)
      expect(processor.processAssistantMessage).toHaveBeenCalledTimes(1)
    }
  )

  it('omits raw unpadded base64 from the stored user text', async () => {
    const binary = Buffer.from('<svg>' + 'a'.repeat(115) + '</svg>').toString('base64')
    expect(binary.endsWith('=')).toBe(false)
    await service.processMessage(`describe this ${binary}`, 1)
    expect(histories.get(1)?.[0].content).toBe('describe this')
    expect(histories.get(1)?.some(({ content }) => content.includes(binary))).toBe(false)
  })

  it('serializes overlapping turns so the next observes saved context', async () => {
    const started = deferred()
    const finish = deferred()
    processor.processAssistantMessage.mockImplementationOnce(async () => {
      started.resolve()
      await finish.promise
      return { response: entry('first answer'), shouldSkipAI: false }
    })
    const first = service.processMessage('first', 1)
    await started.promise
    const second = service.processMessage('second', 1)
    expect(redis.getPersonalAssistantMessages).toHaveBeenCalledTimes(1)
    finish.resolve()
    await Promise.all([first, second])
    expect(processor.processAssistantMessage.mock.calls[1][4]).toEqual([
      entry('first', roleTypes.user),
      entry('first answer'),
    ])
    expect((service as any).pending.size).toBe(0)
  })

  it('runs different users concurrently', async () => {
    const started = deferred()
    const finish = deferred()
    processor.processAssistantMessage.mockImplementationOnce(async () => {
      started.resolve()
      await finish.promise
      return { response: entry('first answer'), shouldSkipAI: false }
    })
    const first = service.processMessage('first', 1)
    await started.promise
    await service.processMessage('other', 91)
    expect(histories.has(91)).toBe(true)
    finish.resolve()
    await first
  })

  it('propagates processing failure and releases the next queued turn', async () => {
    const failure = new Error('processor failed')
    processor.processAssistantMessage.mockRejectedValueOnce(failure)
    const first = service.processMessage('first', 1)
    const second = service.processMessage('second', 1)
    await expect(first).rejects.toBe(failure)
    await second
    expect(histories.get(1)).toEqual([entry('second', roleTypes.user), entry('answer second')])
    expect((service as any).pending.size).toBe(0)
  })
})
