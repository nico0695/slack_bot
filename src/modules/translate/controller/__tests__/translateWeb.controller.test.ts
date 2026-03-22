import BadRequestError from '../../../../shared/utils/errors/BadRequestError'
import TranslateWebController from '../translateWeb.controller'

jest.mock('../../../../shared/middleware/auth', () => {
  const identityDecorator = (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ): PropertyDescriptor => descriptor

  return {
    HttpAuth: identityDecorator,
    Permission: () => identityDecorator,
    Profiles: {
      USER: 'USER',
      USER_PREMIUM: 'USER_PREMIUM',
      ADMIN: 'ADMIN',
    },
  }
})

const translateMock = jest.fn()

const translateServicesMock = {
  translate: translateMock,
}

describe('TranslateWebController', () => {
  let controller: TranslateWebController
  let res: any

  beforeEach(() => {
    jest.clearAllMocks()
    controller = new TranslateWebController(translateServicesMock as any)
    controller.userData = { id: 11 } as any
    res = { send: jest.fn() }
  })

  describe('translate', () => {
    it('translates text successfully', async () => {
      const req: any = {
        body: { text: 'Hola mundo', targetLang: 'english' },
      }
      translateMock.mockResolvedValue({
        data: { translatedText: 'Hello world', targetLang: 'english' },
      })

      await controller.translate(req, res)

      expect(translateMock).toHaveBeenCalledWith('Hola mundo', 'english')
      expect(res.send).toHaveBeenCalledWith({
        translatedText: 'Hello world',
        targetLang: 'english',
      })
    })

    it('throws BadRequestError when text is missing', async () => {
      const req: any = { body: { targetLang: 'english' } }

      await expect(controller.translate(req, res)).rejects.toThrow(BadRequestError)

      expect(translateMock).not.toHaveBeenCalled()
    })

    it('throws BadRequestError when targetLang is missing', async () => {
      const req: any = { body: { text: 'Hola mundo' } }

      await expect(controller.translate(req, res)).rejects.toThrow(BadRequestError)

      expect(translateMock).not.toHaveBeenCalled()
    })

    it('throws BadRequestError when text is empty', async () => {
      const req: any = { body: { text: '', targetLang: 'english' } }

      await expect(controller.translate(req, res)).rejects.toThrow(BadRequestError)

      expect(translateMock).not.toHaveBeenCalled()
    })

    it('throws BadRequestError when service returns error', async () => {
      const req: any = {
        body: { text: 'Hola mundo', targetLang: 'english' },
      }
      translateMock.mockResolvedValue({ error: 'Translation failed' })

      await expect(controller.translate(req, res)).rejects.toThrow(BadRequestError)
    })
  })
})
