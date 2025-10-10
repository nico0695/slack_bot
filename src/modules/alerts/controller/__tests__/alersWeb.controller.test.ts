import BadRequestError from '../../../../shared/utils/errors/BadRequestError'
import AlertsWebController from '../alersWeb.controller'

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

const createAlertMock = jest.fn()
const getAlertsByUserIdMock = jest.fn()
const deleteAlertMock = jest.fn()

const alertsServicesMock = {
  createAlert: createAlertMock,
  getAlertsByUserId: getAlertsByUserIdMock,
  deleteAlert: deleteAlertMock,
}

jest.mock('../../services/alerts.services', () => ({
  __esModule: true,
  default: {
    getInstance: () => alertsServicesMock,
  },
}))

describe('AlertsWebController', () => {
  let controller: AlertsWebController
  let res: any

  beforeEach(() => {
    jest.clearAllMocks()
    controller = AlertsWebController.getInstance()
    controller.userData = { id: 7 } as any
    res = { send: jest.fn() }
  })

  describe('createAlert', () => {
    it('creates alert when payload is valid', async () => {
      const req: any = { body: { message: 'Reminder', date: new Date() } }
      createAlertMock.mockResolvedValue({ data: { id: 1 } })

      await controller.createAlert(req, res)

      expect(createAlertMock).toHaveBeenCalledWith({
        message: 'Reminder',
        date: req.body.date,
        userId: 7,
      })
      expect(res.send).toHaveBeenCalledWith({ id: 1 })
    })

    it('throws BadRequestError when required fields are missing', async () => {
      const req: any = { body: { message: '', date: null } }

      await expect(controller.createAlert(req, res)).rejects.toThrow(BadRequestError)

      expect(createAlertMock).not.toHaveBeenCalled()
      expect(res.send).not.toHaveBeenCalled()
    })

    it('throws BadRequestError when service returns an error', async () => {
      const req: any = { body: { message: 'Ping', date: new Date() } }
      createAlertMock.mockResolvedValue({ error: 'nope' })

      await expect(controller.createAlert(req, res)).rejects.toThrow(BadRequestError)

      expect(res.send).not.toHaveBeenCalled()
    })
  })

  describe('getAlerts', () => {
    it('responds with alerts list', async () => {
      const req: any = {}
      const alerts = [{ id: 1 }]
      getAlertsByUserIdMock.mockResolvedValue({ data: alerts })

      await controller.getAlerts(req, res)

      expect(getAlertsByUserIdMock).toHaveBeenCalledWith(7)
      expect(res.send).toHaveBeenCalledWith(alerts)
    })

    it('throws BadRequestError when service fails', async () => {
      const req: any = {}
      getAlertsByUserIdMock.mockResolvedValue({ error: 'fail' })

      await expect(controller.getAlerts(req, res)).rejects.toThrow(BadRequestError)

      expect(res.send).not.toHaveBeenCalled()
    })
  })

  describe('deleteAlert', () => {
    it('removes alert and returns result', async () => {
      const req: any = { params: { id: '9' } }
      deleteAlertMock.mockResolvedValue({ data: true })

      await controller.deleteAlert(req, res)

      expect(deleteAlertMock).toHaveBeenCalledWith('9', 7)
      expect(res.send).toHaveBeenCalledWith(true)
    })

    it('throws BadRequestError when deletion fails', async () => {
      const req: any = { params: { id: '9' } }
      deleteAlertMock.mockResolvedValue({ error: 'cannot delete' })

      await expect(controller.deleteAlert(req, res)).rejects.toThrow(BadRequestError)

      expect(res.send).not.toHaveBeenCalled()
    })
  })
})
