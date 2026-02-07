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
    jest.spyOn(console, 'error').mockImplementation(() => {})
    const fn = openaiMocks.createChatCompletion
    if (fn) {
      fn.mockReset()
    }
  })

  afterEach(() => {
    ;(console.error as jest.Mock).mockRestore()
  })

  it('returns null when API call throws', async () => {
    const chatCompletion = getChatCompletionMock()
    chatCompletion.mockRejectedValue(new Error('429 rate limit'))

    const result = await repository.chatCompletion([{ role: 'user', content: 'hola' } as any])

    expect(result).toBeNull()
  })
})
