import OpenaiRepository from '../openai.repository'

const openaiMocks: { createChatCompletion?: jest.Mock } = {}

const getChatCompletionMock = (): jest.Mock => {
  if (!openaiMocks.createChatCompletion) {
    throw new Error('OpenAI createChatCompletion mock not initialized')
  }
  return openaiMocks.createChatCompletion
}

jest.mock('openai', () => ({
  Configuration: jest.fn().mockImplementation((config) => config),
  OpenAIApi: jest.fn().mockImplementation(() => {
    openaiMocks.createChatCompletion = jest.fn()
    return {
      createChatCompletion: openaiMocks.createChatCompletion,
    }
  }),
}))

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

const PROMPT_SENTINEL = 'PROMPT-CENTINELA-5512'
const COMPLETION_SENTINEL = 'COMPLETION-CENTINELA-8830'

const completion = (finishReason: string | undefined): any => ({
  data: {
    choices: [
      {
        message: { role: 'assistant', content: `{"intent":"${COMPLETION_SENTINEL}` },
        finish_reason: finishReason,
      },
    ],
    usage: { prompt_tokens: 1200, completion_tokens: 400, total_tokens: 1600 },
  },
})

const requestMessages = [
  { role: 'system', content: `instrucciones ${PROMPT_SENTINEL}` },
  { role: 'assistant', content: 'turno previo', provider: 'assistant' },
  { role: 'user', content: 'hola' },
] as any[]

describe('OpenaiRepository', () => {
  let repository: OpenaiRepository

  beforeAll(() => {
    process.env.OPENAI_API_KEY = 'openai-token'
    repository = new OpenaiRepository()
  })

  beforeEach(() => {
    jest.clearAllMocks()
    const fn = openaiMocks.createChatCompletion
    if (fn) {
      fn.mockReset()
    }
  })

  it('returns null when API call throws', async () => {
    const chatCompletion = getChatCompletionMock()
    chatCompletion.mockRejectedValue(new Error('429 rate limit'))

    const result = await repository.chatCompletion([{ role: 'user', content: 'hola' } as any])

    expect(result).toBeNull()
  })

  it('keeps roles and order, dropping extra fields', async () => {
    const chatCompletion = getChatCompletionMock()
    chatCompletion.mockResolvedValue(completion('stop'))

    await repository.chatCompletion(requestMessages)

    expect(chatCompletion.mock.calls[0][0].messages).toEqual([
      { role: 'system', content: `instrucciones ${PROMPT_SENTINEL}` },
      { role: 'assistant', content: 'turno previo' },
      { role: 'user', content: 'hola' },
    ])
  })

  it('uses 400 max tokens and temperature 0 in classification mode', async () => {
    const chatCompletion = getChatCompletionMock()
    chatCompletion.mockResolvedValue(completion('stop'))

    const result = await repository.chatCompletion(requestMessages, { mode: 'classification' })

    expect(result?.content).toContain(COMPLETION_SENTINEL)
    expect(chatCompletion.mock.calls[0][0]).toMatchObject({
      model: 'gpt-4o-mini',
      temperature: 0,
      max_tokens: 400,
    })
    expect(mockLogFns.warn).not.toHaveBeenCalled()
  })

  it('sets no max tokens in default mode', async () => {
    const chatCompletion = getChatCompletionMock()
    chatCompletion.mockResolvedValue(completion('length'))

    await repository.chatCompletion(requestMessages)

    const request = chatCompletion.mock.calls[0][0]
    expect(request.model).toBe('gpt-4o-mini')
    expect(request.max_tokens).toBeUndefined()
    // finish_reason is only reported for classification
    expect(mockLogFns.warn).not.toHaveBeenCalled()
  })

  it.each([['length'], ['content_filter'], [undefined]])(
    'warns with metadata only when a classification finishes with %s',
    async (finishReason) => {
      const chatCompletion = getChatCompletionMock()
      chatCompletion.mockResolvedValue(completion(finishReason))

      const result = await repository.chatCompletion(requestMessages, { mode: 'classification' })

      // The response is still returned to the caller
      expect(result?.content).toContain(COMPLETION_SENTINEL)
      expect(mockLogFns.warn).toHaveBeenCalledTimes(1)
      expect(mockLogFns.warn.mock.calls[0][0]).toEqual({
        finishReason,
        model: 'gpt-4o-mini',
        promptTokens: 1200,
        completionTokens: 400,
        totalTokens: 1600,
      })

      const logged = JSON.stringify(mockLogFns.warn.mock.calls[0])
      expect(logged).not.toContain(PROMPT_SENTINEL)
      expect(logged).not.toContain(COMPLETION_SENTINEL)
      expect(logged).not.toContain('hola')
    }
  )
})
