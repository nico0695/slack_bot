import BadRequestError from '../../../../shared/utils/errors/BadRequestError'
import UsersController from '../users.controller'

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
      ADMIN: 'ADMIN',
    },
  }
})

const createUserMock = jest.fn()
const getUsersMock = jest.fn()
const getUserByIdMock = jest.fn()
const updateUserByIdMock = jest.fn()
const subscribeNotificationsMock = jest.fn()

const usersServicesMock = {
  createUser: createUserMock,
  getUsers: getUsersMock,
  getUserById: getUserByIdMock,
  updateUserById: updateUserByIdMock,
  subscribeNotifications: subscribeNotificationsMock,
}

jest.mock('../../services/users.services', () => ({
  __esModule: true,
  default: {
    getInstance: () => usersServicesMock,
  },
}))

describe('UsersController', () => {
  let controller: UsersController
  let res: any

  beforeEach(() => {
    jest.clearAllMocks()
    controller = UsersController.getInstance()
    controller.userData = { id: 99, email: 'test@example.com' } as any
    res = {
      send: jest.fn(),
      status: jest.fn().mockReturnThis(),
    }
  })

  describe('createUser', () => {
    it('creates user when payload valid', async () => {
      const req: any = {
        body: {
          username: 'nick',
          name: 'Nick',
          lastName: 'Doe',
          email: 'nick@example.com',
          phone: '123',
        },
      }
      createUserMock.mockResolvedValue({ data: { id: 1 } })

      await controller.createUser(req, res)

      expect(createUserMock).toHaveBeenCalledWith({
        username: 'nick',
        name: 'Nick',
        lastName: 'Doe',
        email: 'nick@example.com',
        phone: '123',
        enabled: false,
      })
      expect(res.send).toHaveBeenCalledWith({ id: 1 })
    })

    it('throws BadRequestError when required fields missing', async () => {
      const req: any = { body: { username: 'nick', name: '', email: '', phone: '' } }

      await expect(controller.createUser(req, res)).rejects.toThrow(BadRequestError)
      expect(createUserMock).not.toHaveBeenCalled()
    })

    it('throws BadRequestError when service returns error', async () => {
      const req: any = {
        body: {
          username: 'nick',
          name: 'Nick',
          lastName: 'Doe',
          email: 'nick@example.com',
          phone: '123',
        },
      }
      createUserMock.mockResolvedValue({ error: 'fail' })

      await expect(controller.createUser(req, res)).rejects.toThrow(BadRequestError)
    })
  })

  describe('getUsers', () => {
    it('returns paginated users', async () => {
      const req: any = { query: { page: '2', pageSize: '10' } }
      getUsersMock.mockResolvedValue({ data: { data: [], count: 0 } })

      await controller.getUsers(req, res)

      expect(getUsersMock).toHaveBeenCalledWith(2, 10)
      expect(res.status).toHaveBeenCalledWith(200)
      expect(res.send).toHaveBeenCalledWith({ data: [], count: 0 })
    })

    it('throws BadRequestError when service fails', async () => {
      const req: any = { query: {} }
      getUsersMock.mockResolvedValue({ error: 'not allowed' })

      await expect(controller.getUsers(req, res)).rejects.toThrow(BadRequestError)
    })
  })

  it('getUserMe returns authenticated user', async () => {
    const req: any = {}

    await controller.getUserMe(req, res)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.send).toHaveBeenCalledWith(controller.userData)
  })

  describe('getUserById', () => {
    it('retrieves user by id', async () => {
      const req: any = { params: { id: '5' } }
      getUserByIdMock.mockResolvedValue({ data: { id: 5 } })

      await controller.getUserById(req, res)

      expect(getUserByIdMock).toHaveBeenCalledWith(5)
      expect(res.status).toHaveBeenCalledWith(200)
      expect(res.send).toHaveBeenCalledWith({ id: 5 })
    })

    it('throws BadRequestError on service error', async () => {
      const req: any = { params: { id: '7' } }
      getUserByIdMock.mockResolvedValue({ error: 'fail' })

      await expect(controller.getUserById(req, res)).rejects.toThrow(BadRequestError)
    })
  })

  describe('updateUser', () => {
    it('updates user with valid payload', async () => {
      const req: any = {
        params: { id: '8' },
        body: {
          username: 'nick',
          name: 'Nick',
          lastName: 'Doe',
          email: 'nick@example.com',
          phone: '555',
          enabled: true,
          profile: 1,
        },
      }
      updateUserByIdMock.mockResolvedValue({ data: { id: 8 } })

      await controller.updateUser(req, res)

      expect(updateUserByIdMock).toHaveBeenCalledWith(8, {
        username: 'nick',
        name: 'Nick',
        lastName: 'Doe',
        email: 'nick@example.com',
        phone: '555',
        enabled: true,
        profile: 1,
      })
      expect(res.send).toHaveBeenCalledWith({ id: 8 })
    })

    it('throws BadRequestError when name or email missing', async () => {
      const req: any = {
        params: { id: '8' },
        body: { name: '', email: '', username: 'nick' },
      }

      await expect(controller.updateUser(req, res)).rejects.toThrow(BadRequestError)
      expect(updateUserByIdMock).not.toHaveBeenCalled()
    })

    it('throws BadRequestError when service fails', async () => {
      const req: any = {
        params: { id: '8' },
        body: {
          username: 'nick',
          name: 'Nick',
          lastName: 'Doe',
          email: 'nick@example.com',
          phone: '555',
          enabled: true,
          profile: 1,
        },
      }
      updateUserByIdMock.mockResolvedValue({ error: 'fail' })

      await expect(controller.updateUser(req, res)).rejects.toThrow(BadRequestError)
    })
  })

  describe('subscribeNotifications', () => {
    it('subscribes user push notifications', async () => {
      const req: any = { body: { endpoint: 'foo' } }
      subscribeNotificationsMock.mockResolvedValue({ data: true })

      await controller.subscribeNotifications(req, res)

      expect(subscribeNotificationsMock).toHaveBeenCalledWith(99, { endpoint: 'foo' })
      expect(res.send).toHaveBeenCalledWith(true)
    })

    it('throws BadRequestError when subscription fails', async () => {
      const req: any = { body: {} }
      subscribeNotificationsMock.mockResolvedValue({ error: 'fail' })

      await expect(controller.subscribeNotifications(req, res)).rejects.toThrow(BadRequestError)
    })
  })
})
