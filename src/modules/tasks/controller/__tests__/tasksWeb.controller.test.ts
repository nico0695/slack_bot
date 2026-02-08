import BadRequestError from '../../../../shared/utils/errors/BadRequestError'
import TasksWebController from '../tasksWeb.controller'

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

const createTaskMock = jest.fn()
const getTasksByUserIdMock = jest.fn()
const updateTaskMock = jest.fn()
const deleteTaskMock = jest.fn()

const tasksServicesMock = {
  createTask: createTaskMock,
  getTasksByUserId: getTasksByUserIdMock,
  updateTask: updateTaskMock,
  deleteTask: deleteTaskMock,
}

jest.mock('../../services/tasks.services', () => ({
  __esModule: true,
  default: {
    getInstance: () => tasksServicesMock,
  },
}))

describe('TasksWebController', () => {
  let controller: TasksWebController
  let res: any

  beforeEach(() => {
    jest.clearAllMocks()
    controller = TasksWebController.getInstance()
    controller.userData = { id: 15 } as any
    res = { send: jest.fn() }
  })

  describe('createTask', () => {
    it('creates task with default description', async () => {
      const req: any = {
        body: { title: 'Task', status: 'pending', alertDate: '2024-01-01T00:00:00Z' },
      }
      createTaskMock.mockResolvedValue({ data: { id: 1 } })

      await controller.createTask(req, res)

      expect(createTaskMock).toHaveBeenCalledWith({
        title: 'Task',
        description: '',
        status: 'pending',
        alertDate: new Date('2024-01-01T00:00:00Z'),
        userId: 15,
      })
      expect(res.send).toHaveBeenCalledWith({ id: 1 })
    })

    it('throws BadRequestError when title missing', async () => {
      const req: any = { body: { title: '', status: 'pending' } }

      await expect(controller.createTask(req, res)).rejects.toThrow(BadRequestError)

      expect(createTaskMock).not.toHaveBeenCalled()
    })

    it('throws BadRequestError when service fails', async () => {
      const req: any = { body: { title: 'Task', status: 'pending' } }
      createTaskMock.mockResolvedValue({ error: 'fail' })

      await expect(controller.createTask(req, res)).rejects.toThrow(BadRequestError)
    })
  })

  describe('getTasks', () => {
    it('returns users tasks', async () => {
      const req: any = {}
      const tasks = [{ id: 1 }]
      getTasksByUserIdMock.mockResolvedValue({ data: tasks })

      await controller.getTasks(req, res)

      expect(getTasksByUserIdMock).toHaveBeenCalledWith(15)
      expect(res.send).toHaveBeenCalledWith(tasks)
    })

    it('throws BadRequestError when service fails', async () => {
      const req: any = {}
      getTasksByUserIdMock.mockResolvedValue({ error: 'fail' })

      await expect(controller.getTasks(req, res)).rejects.toThrow(BadRequestError)
    })
  })

  describe('updateTask', () => {
    it('updates task when payload is valid', async () => {
      const req: any = {
        params: { id: '7' },
        body: {
          title: 'Updated',
          description: 'desc',
          status: 'completed',
          alertDate: '2024-01-01T00:00:00Z',
        },
      }
      updateTaskMock.mockResolvedValue({ data: true })

      await controller.updateTask(req, res)

      expect(updateTaskMock).toHaveBeenCalledWith(7, {
        id: 7,
        title: 'Updated',
        description: 'desc',
        status: 'completed',
        alertDate: new Date('2024-01-01T00:00:00Z'),
        userId: 15,
      })
      expect(res.send).toHaveBeenCalledWith(true)
    })

    it('throws BadRequestError when params id is empty', async () => {
      const req: any = {
        params: { id: '' },
        body: { title: 'Task' },
      }

      await expect(controller.updateTask(req, res)).rejects.toThrow(BadRequestError)

      expect(updateTaskMock).not.toHaveBeenCalled()
    })

    it('throws BadRequestError when title is missing', async () => {
      const req: any = {
        params: { id: '7' },
        body: { title: '', description: '' },
      }

      await expect(controller.updateTask(req, res)).rejects.toThrow(BadRequestError)

      expect(updateTaskMock).not.toHaveBeenCalled()
    })

    it('throws BadRequestError when service fails', async () => {
      const req: any = {
        params: { id: '7' },
        body: { title: 'Task', status: 'pending', description: '', alertDate: null },
      }
      updateTaskMock.mockResolvedValue({ error: 'fail' })

      await expect(controller.updateTask(req, res)).rejects.toThrow(BadRequestError)
    })
  })

  describe('deleteTask', () => {
    it('returns deletion result', async () => {
      const req: any = { params: { id: '5' } }
      deleteTaskMock.mockResolvedValue({ data: true })

      await controller.deleteTask(req, res)

      expect(deleteTaskMock).toHaveBeenCalledWith(5, 15)
      expect(res.send).toHaveBeenCalledWith(true)
    })

    it('throws BadRequestError when service fails', async () => {
      const req: any = { params: { id: '5' } }
      deleteTaskMock.mockResolvedValue({ error: 'fail' })

      await expect(controller.deleteTask(req, res)).rejects.toThrow(BadRequestError)
    })
  })
})
