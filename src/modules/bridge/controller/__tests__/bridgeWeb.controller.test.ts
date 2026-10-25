import BadRequestError from '../../../../shared/utils/errors/BadRequestError'
import BridgeWebController from '../bridgeWeb.controller'

jest.mock('../../../../shared/middleware/auth', () => {
  const identityDecorator = (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ): PropertyDescriptor => descriptor

  return {
    HttpAuth: identityDecorator,
    Permission: () => identityDecorator,
  }
})

const getConfigMock = jest.fn()
const updateConfigMock = jest.fn()

const bridgeServicesMock = {
  getConfig: getConfigMock,
  updateConfig: updateConfigMock,
}

const configResponse = {
  baseUrl: 'https://bridge.example.com',
  enabled: true,
  secretConfigured: true,
}

describe('BridgeWebController', () => {
  let controller: BridgeWebController
  let res: any

  beforeEach(() => {
    jest.clearAllMocks()
    controller = new BridgeWebController(bridgeServicesMock as any)
    controller.userData = { id: 7 } as any
    res = { send: jest.fn() }
  })

  describe('getConfig', () => {
    it('responds with the config of the authenticated user', async () => {
      getConfigMock.mockResolvedValue({ data: configResponse })

      await controller.getConfig({}, res)

      expect(getConfigMock).toHaveBeenCalledWith(7)
      expect(res.send).toHaveBeenCalledWith(configResponse)
    })

    it('throws BadRequestError when service fails', async () => {
      getConfigMock.mockResolvedValue({ error: 'fail' })

      await expect(controller.getConfig({}, res)).rejects.toThrow(BadRequestError)
      expect(res.send).not.toHaveBeenCalled()
    })
  })

  describe('updateConfig', () => {
    it('updates the config of the authenticated user', async () => {
      const secret = 's'.repeat(32)
      const req: any = { body: { baseUrl: 'https://bridge.example.com/', secret } }
      updateConfigMock.mockResolvedValue({ data: configResponse })

      await controller.updateConfig(req, res)

      expect(updateConfigMock).toHaveBeenCalledWith(7, {
        baseUrl: 'https://bridge.example.com',
        secret,
      })
      expect(res.send).toHaveBeenCalledWith(configResponse)
    })

    it('rejects a body that targets another user', async () => {
      const req: any = { body: { userId: 2, enabled: false } }

      await expect(controller.updateConfig(req, res)).rejects.toThrow(BadRequestError)
      expect(updateConfigMock).not.toHaveBeenCalled()
    })

    it('rejects invalid URLs without calling the service', async () => {
      const req: any = { body: { baseUrl: 'https://127.0.0.1' } }

      await expect(controller.updateConfig(req, res)).rejects.toThrow(BadRequestError)
      expect(updateConfigMock).not.toHaveBeenCalled()
    })

    it('throws BadRequestError when service returns an error', async () => {
      const req: any = { body: { enabled: true } }
      updateConfigMock.mockResolvedValue({ error: 'nope' })

      await expect(controller.updateConfig(req, res)).rejects.toThrow(BadRequestError)
      expect(res.send).not.toHaveBeenCalled()
    })
  })
})
