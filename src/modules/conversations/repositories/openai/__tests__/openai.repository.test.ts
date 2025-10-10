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

describe('OpenaiRepository', () => {
  let repository: OpenaiRepository

  beforeAll(() => {
    process.env.OPENAI_API_KEY = 'openai-token'
    repository = OpenaiRepository.getInstance()
  })

  beforeEach(() => {
    jest.clearAllMocks()
    const fn = openaiMocks.createChatCompletion
    if (fn) {
      fn.mockReset()
    }
  })

  it('sends completion request using default model', async () => {
    const message = { role: 'assistant', content: 'hello', provider: 'assistant' } as any
    const chatCompletion = getChatCompletionMock()
    chatCompletion.mockResolvedValue({
      data: { choices: [{ message }] },
    })

    const result = await repository.chatCompletion([{ role: 'user', content: 'hola' } as any])

    expect(chatCompletion).toHaveBeenCalled()
    const payload = chatCompletion.mock.calls[0][0]
    expect(payload.model).toBe('gpt-3.5-turbo')
    expect(payload.temperature).toBe(0.4)
    expect(payload.max_tokens).toBeUndefined()
    expect(result).toBe(message)
  })

  it('uses classification model when mode set', async () => {
    const chatCompletion = getChatCompletionMock()
    chatCompletion.mockResolvedValue({
      data: { choices: [{ message: { role: 'assistant', content: 'classified' } }] },
    })

    await repository.chatCompletion(
      [{ role: 'user', content: 'hola' } as any],
      { mode: 'classification' }
    )

    const payload = chatCompletion.mock.calls[0][0]
    expect(payload.model).toBe('gpt-4.1-nano')
    expect(payload.temperature).toBe(0)
    expect(payload.max_tokens).toBe(200)
  })

  it('returns null when API call throws', async () => {
    const chatCompletion = getChatCompletionMock()
    chatCompletion.mockRejectedValue(new Error('429 rate limit'))

    const result = await repository.chatCompletion([{ role: 'user', content: 'hola' } as any])

    expect(result).toBeNull()
  })
})
