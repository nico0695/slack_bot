import GeminiRepository from '../gemini.repository'

const geminiMocks: { generateContent?: jest.Mock } = {}

const getGenerateContentMock = (): jest.Mock => {
  if (!geminiMocks.generateContent) {
    throw new Error('Gemini generateContent mock not initialized')
  }
  return geminiMocks.generateContent
}

jest.mock('@google/genai', () => ({
  GoogleGenAI: jest.fn().mockImplementation(() => {
    geminiMocks.generateContent = jest.fn()
    return {
      models: {
        generateContent: geminiMocks.generateContent,
      },
    }
  }),
}))

describe('GeminiRepository', () => {
  let repository: GeminiRepository

  beforeAll(() => {
    process.env.GEMINI_API_KEY = 'test-key'
    repository = GeminiRepository.getInstance()
  })

  beforeEach(() => {
    jest.clearAllMocks()
    const fn = geminiMocks.generateContent
    if (fn) {
      fn.mockReset()
    }
  })

  it('returns assistant conversation on success', async () => {
    const generateContent = getGenerateContentMock()
    generateContent.mockResolvedValue({ text: 'hello' })

    const result = await repository.chatCompletion([
      { role: 'user', content: 'hola' } as any,
    ])

    expect(generateContent).toHaveBeenCalled()
    expect(result).toEqual({
      role: 'assistant',
      content: 'hello',
      provider: 'assistant',
    })
  })

  it('uses classification model when requested', async () => {
    const generateContent = getGenerateContentMock()
    generateContent.mockResolvedValue({ text: 'classified' })

    await repository.chatCompletion(
      [{ role: 'user', content: 'hi' } as any],
      { mode: 'classification' }
    )

    const lastCallArgs = generateContent.mock.calls[0][0]
    expect(lastCallArgs.model).toBe('gemini-2.5-flash-lite')
  })

  it('returns null when API call fails', async () => {
    const generateContent = getGenerateContentMock()
    generateContent.mockRejectedValue(new Error('429 Too Many Requests'))

    const result = await repository.chatCompletion([{ role: 'user', content: 'hola' } as any])

    expect(result).toBeNull()
  })
})
