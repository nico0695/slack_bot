import BitbucketController from '../bitbucket.controller'

jest.mock('../../../../config/slackConfig', () => ({
  connectionSlackApp: {
    client: { chat: { postMessage: jest.fn() } },
  },
  slackListenersKey: {},
}))

jest.mock('../../../../shared/middleware/auth', () => {
  const identityDecorator = (
    _target: any,
    _propertyKey: string,
    descriptor: PropertyDescriptor
  ): PropertyDescriptor => descriptor

  return {
    SlackAuth: identityDecorator,
  }
})

const updateUserByIdMock = jest.fn()

jest.mock('../../../users/services/users.services', () => ({
  __esModule: true,
  default: {
    getInstance: () => ({
      updateUserById: updateUserByIdMock,
    }),
  },
}))

describe('BitbucketController', () => {
  let controller: BitbucketController
  const say = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
    controller = BitbucketController.getInstance()
    controller.userData = { id: 1, username: 'user', name: 'User', lastName: '', phone: '', email: 'user@test.com', enabled: true }
  })

  it('registers atlassianEmail successfully', async () => {
    updateUserByIdMock.mockResolvedValue({ data: { id: 1 } })

    await controller.registerAtlassianEmail({
      payload: { text: '.bb me user@company.com', user: 'U123', channel_type: 'im', channel: 'C123' },
      say,
    })

    expect(updateUserByIdMock).toHaveBeenCalledWith(1, { atlassianEmail: 'user@company.com' })
    expect(say).toHaveBeenCalledWith(
      '✅ Tu email de Bitbucket fue registrado correctamente: *user@company.com*'
    )
  })

  it('replies with error when no email is provided', async () => {
    await controller.registerAtlassianEmail({
      payload: { text: '.bb me', user: 'U123', channel_type: 'im', channel: 'C123' },
      say,
    })

    expect(updateUserByIdMock).not.toHaveBeenCalled()
    expect(say).toHaveBeenCalledWith(
      'Por favor indicá un email válido. Uso: `.bb me tu@empresa.com` 📧'
    )
  })

  it('replies with error when email format is invalid', async () => {
    await controller.registerAtlassianEmail({
      payload: { text: '.bb me notanemail', user: 'U123', channel_type: 'im', channel: 'C123' },
      say,
    })

    expect(updateUserByIdMock).not.toHaveBeenCalled()
    expect(say).toHaveBeenCalledWith(
      'Por favor indicá un email válido. Uso: `.bb me tu@empresa.com` 📧'
    )
  })

  it('replies with error when service returns an error', async () => {
    updateUserByIdMock.mockResolvedValue({ error: 'Usuario no encontrado' })

    await controller.registerAtlassianEmail({
      payload: { text: '.bb me user@company.com', user: 'U123', channel_type: 'im', channel: 'C123' },
      say,
    })

    expect(say).toHaveBeenCalledWith('Ups! No se pudo registrar tu email de Bitbucket 😢')
  })

  it('replies with error when userData is missing', async () => {
    controller.userData = undefined

    await controller.registerAtlassianEmail({
      payload: { text: '.bb me user@company.com', user: 'U123', channel_type: 'im', channel: 'C123' },
      say,
    })

    expect(updateUserByIdMock).not.toHaveBeenCalled()
    expect(say).toHaveBeenCalledWith('Ups! No se pudo obtener tu información 🤷‍♂️')
  })
})
