import TranslateServices from '../translate.services'

jest.mock('../../../../config/logger', () => ({
  createModuleLogger: jest.fn().mockReturnValue({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    fatal: jest.fn(),
  }),
}))

const translateMock = jest.fn()

const openaiTranslateInstance = {
  translate: translateMock,
}

jest.mock('../../repositories/openai/openaiTranslate.repository', () => ({
  __esModule: true,
  default: {
    getInstance: () => openaiTranslateInstance,
  },
}))

jest.mock('../../repositories/gemini/geminiTranslate.repository', () => ({
  __esModule: true,
  default: {
    getInstance: () => ({}),
  },
}))

describe('TranslateServices', () => {
  const services = TranslateServices.getInstance()

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('translate', () => {
    it('returns translated text on success', async () => {
      translateMock.mockResolvedValue('Hello world')

      const result = await services.translate('Hola mundo', 'english')

      expect(translateMock).toHaveBeenCalledWith(
        'Hola mundo',
        'english',
        expect.any(String)
      )
      expect(result).toEqual({
        data: {
          translatedText: 'Hello world',
          targetLang: 'english',
        },
      })
    })

    it('returns error when repository returns null', async () => {
      translateMock.mockResolvedValue(null)

      const result = await services.translate('Hola mundo', 'english')

      expect(result).toEqual({ error: 'No se recibió respuesta del servicio de traducción' })
    })

    it('returns error when repository throws', async () => {
      translateMock.mockRejectedValue(new Error('API error'))

      const result = await services.translate('Hola mundo', 'english')

      expect(result).toEqual({ error: 'Error inesperado al procesar la traducción' })
    })

    it('passes system prompt to repository', async () => {
      translateMock.mockResolvedValue('translated')

      await services.translate('text', 'spanish')

      const systemPrompt = translateMock.mock.calls[0][2]
      expect(systemPrompt).toContain('technical translator')
      expect(systemPrompt).toContain('JSON keys')
    })
  })
})
