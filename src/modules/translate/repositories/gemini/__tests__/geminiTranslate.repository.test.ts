import GeminiTranslateRepository from '../geminiTranslate.repository'

const generateContentMock = jest.fn()

jest.mock('@google/genai', () => ({
  GoogleGenAI: jest.fn().mockImplementation(() => ({
    models: {
      generateContent: generateContentMock,
    },
  })),
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

describe('GeminiTranslateRepository', () => {
  let repository: GeminiTranslateRepository

  beforeAll(() => {
    process.env.GEMINI_API_KEY = 'gemini-token'
    repository = GeminiTranslateRepository.getInstance()
  })

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('returns translated text on success', async () => {
    generateContentMock.mockResolvedValue({ text: 'Hello world' })

    const result = await repository.translate('Hola mundo', 'english', 'system prompt')

    expect(result).toBe('Hello world')
    expect(generateContentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gemini-2.0-flash',
      })
    )
  })

  it('returns null when API call throws', async () => {
    generateContentMock.mockRejectedValue(new Error('429 rate limit'))

    const result = await repository.translate('Hola mundo', 'english', 'system prompt')

    expect(result).toBeNull()
  })

  it('returns null when response has no text', async () => {
    generateContentMock.mockResolvedValue({ text: null })

    const result = await repository.translate('text', 'english', 'prompt')

    expect(result).toBeNull()
  })
})
