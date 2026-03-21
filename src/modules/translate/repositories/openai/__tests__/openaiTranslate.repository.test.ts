import OpenaiTranslateRepository from '../openaiTranslate.repository'

const openaiMocks: { createChatCompletion?: jest.Mock } = {}

jest.mock('openai', () => ({
  Configuration: jest.fn().mockImplementation((config) => config),
  OpenAIApi: jest.fn().mockImplementation(() => {
    openaiMocks.createChatCompletion = jest.fn()
    return {
      createChatCompletion: openaiMocks.createChatCompletion,
    }
  }),
}))

jest.mock('../../../../../config/logger', () => ({
  createModuleLogger: jest.fn().mockReturnValue({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    fatal: jest.fn(),
  }),
}))

describe('OpenaiTranslateRepository', () => {
  let repository: OpenaiTranslateRepository

  beforeAll(() => {
    process.env.OPENAI_API_KEY = 'openai-token'
    repository = OpenaiTranslateRepository.getInstance()
  })

  beforeEach(() => {
    jest.clearAllMocks()
    if (openaiMocks.createChatCompletion) {
      openaiMocks.createChatCompletion.mockReset()
    }
  })

  it('returns translated text on success', async () => {
    openaiMocks.createChatCompletion.mockResolvedValue({
      data: {
        choices: [{ message: { content: 'Hello world' } }],
      },
    })

    const result = await repository.translate('Hola mundo', 'english', 'system prompt')

    expect(result).toBe('Hello world')
    expect(openaiMocks.createChatCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gpt-4o-mini',
        temperature: 0.2,
      })
    )
  })

  it('returns null when API call throws', async () => {
    openaiMocks.createChatCompletion.mockRejectedValue(new Error('429 rate limit'))

    const result = await repository.translate('Hola mundo', 'english', 'system prompt')

    expect(result).toBeNull()
  })

  it('returns null when response has no content', async () => {
    openaiMocks.createChatCompletion.mockResolvedValue({
      data: {
        choices: [{ message: {} }],
      },
    })

    const result = await repository.translate('text', 'english', 'prompt')

    expect(result).toBeNull()
  })
})
