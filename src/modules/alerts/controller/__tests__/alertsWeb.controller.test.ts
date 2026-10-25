import BadRequestError from '../../../../shared/utils/errors/BadRequestError'
import ConflictError from '../../../../shared/utils/errors/ConflictError'
import AlertsWebController from '../alertsWeb.controller'

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

describe('AlertsWebController', () => {
  let controller: AlertsWebController
  let res: any

  beforeEach(() => {
    jest.clearAllMocks()
    controller = new AlertsWebController(alertsServicesMock as any)
    controller.userData = { id: 7 } as any
    res = { send: jest.fn() }
  })

  describe('createAlert', () => {
    it('creates alert when payload is valid', async () => {
      const req: any = { body: { message: 'Reminder', date: '2024-06-15T10:00:00Z' } }
      createAlertMock.mockResolvedValue({ data: { id: 1 } })

      await controller.createAlert(req, res)

      expect(createAlertMock).toHaveBeenCalledWith({
        message: 'Reminder',
        date: new Date('2024-06-15T10:00:00Z'),
        userId: 7,
      })
      expect(res.send).toHaveBeenCalledWith({ id: 1 })
    })

    it('throws BadRequestError when required fields are missing', async () => {
      const req: any = { body: { message: '', date: '' } }

      await expect(controller.createAlert(req, res)).rejects.toThrow(BadRequestError)

      expect(createAlertMock).not.toHaveBeenCalled()
      expect(res.send).not.toHaveBeenCalled()
    })

    it('throws BadRequestError when service returns an error', async () => {
      const req: any = { body: { message: 'Ping', date: '2024-06-15T10:00:00Z' } }
      createAlertMock.mockResolvedValue({ error: 'nope' })

      await expect(controller.createAlert(req, res)).rejects.toThrow(BadRequestError)

      expect(res.send).not.toHaveBeenCalled()
    })

    describe('with requestId', () => {
      const requestId = '3F2B8C1E-1A2B-4C3D-8E9F-0A1B2C3D4E5F'

      it('forwards the normalized request metadata', async () => {
        const req: any = {
          body: {
            message: 'Alerta',
            date: '2024-06-15T10:00:00Z',
            requestId,
            source: ' esp32-poc ',
            deviceId: 'esp32-02',
          },
        }
        createAlertMock.mockResolvedValue({ data: { id: 1, requestId: requestId.toLowerCase() } })

        await controller.createAlert(req, res)

        expect(createAlertMock).toHaveBeenCalledWith({
          message: 'Alerta',
          date: new Date('2024-06-15T10:00:00Z'),
          userId: 7,
          requestId: requestId.toLowerCase(),
          source: 'esp32-poc',
          deviceId: 'esp32-02',
        })
        expect(res.send).toHaveBeenCalledWith({ id: 1, requestId: requestId.toLowerCase() })
      })

      it('sets missing metadata to null', async () => {
        const req: any = { body: { message: 'Alerta', date: '2024-06-15T10:00:00Z', requestId } }
        createAlertMock.mockResolvedValue({ data: { id: 1 } })

        await controller.createAlert(req, res)

        expect(createAlertMock).toHaveBeenCalledWith(
          expect.objectContaining({ source: null, deviceId: null })
        )
      })

      it('throws ConflictError with the stored alert id on conflict', async () => {
        const req: any = { body: { message: 'Alerta', date: '2024-06-15T10:00:00Z', requestId } }
        createAlertMock.mockResolvedValue({
          error: 'El requestId ya fue usado con datos distintos',
          conflictAlertId: 12,
        })

        const error = await controller.createAlert(req, res).catch((err) => err)

        expect(error).toBeInstanceOf(ConflictError)
        expect(error.statusCode).toBe(409)
        expect(error.errors).toEqual([
          {
            message: 'El requestId ya fue usado con datos distintos',
            context: { code: 'ALERT_REQUEST_CONFLICT', alertId: 12 },
          },
        ])
        expect(res.send).not.toHaveBeenCalled()
      })

      it.each([
        ['an invalid requestId', { requestId: 'not-a-uuid' }],
        ['source without requestId', { source: 'esp32-poc' }],
        ['deviceId without requestId', { deviceId: 'esp32-02' }],
      ])('rejects %s', async (_, extra) => {
        const req: any = { body: { message: 'Alerta', date: '2024-06-15T10:00:00Z', ...extra } }

        await expect(controller.createAlert(req, res)).rejects.toThrow(BadRequestError)
        expect(createAlertMock).not.toHaveBeenCalled()
      })
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

      expect(deleteAlertMock).toHaveBeenCalledWith(9, 7)
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
