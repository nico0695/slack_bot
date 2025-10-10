import TasksServices from '../tasks.services'
import { TaskStatus } from '../../shared/constants/tasks.constants'

const createTaskMock = jest.fn()
const getTasksByUserIdMock = jest.fn()
const updateTaskMock = jest.fn()
const deleteTaskMock = jest.fn()
const formatTextToDateMock = jest.fn()

const tasksDataSourceInstance = {
  createTask: createTaskMock,
  getTasksByUserId: getTasksByUserIdMock,
  updateTask: updateTaskMock,
  deleteTask: deleteTaskMock,
}

jest.mock('../../repositories/database/tasks.dataSource', () => ({
  __esModule: true,
  default: {
    getInstance: () => tasksDataSourceInstance,
  },
}))

jest.mock('../../../../shared/utils/dates.utils', () => ({
  formatTextToDate: (...args: any[]) => formatTextToDateMock(...args),
}))

describe('TasksServices', () => {
  const services = TasksServices.getInstance()

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('createAssistantTask', () => {
    it('parses alert date and applies defaults', async () => {
      const parsedDate = new Date('2024-04-01T10:00:00.000Z')
      formatTextToDateMock.mockReturnValue(parsedDate)
      const task = { id: 1 }
      createTaskMock.mockResolvedValue(task)

      const result = await services.createAssistantTask(4, 'Title', 'Desc', {
        alertDate: 'mañana',
        status: TaskStatus.IN_PROGRESS,
      })

      expect(formatTextToDateMock).toHaveBeenCalledWith('mañana')
      expect(createTaskMock).toHaveBeenCalledWith({
        userId: 4,
        title: 'Title',
        description: 'Desc',
        alertDate: parsedDate,
        status: TaskStatus.IN_PROGRESS,
      })
      expect(result).toEqual({ data: task })
    })

    it('handles repository errors', async () => {
      formatTextToDateMock.mockReturnValue(null)
      createTaskMock.mockRejectedValue(new Error('fail'))

      const result = await services.createAssistantTask(4, 'Title', 'Desc')

      expect(result.error).toBe('Error al crear la tarea')
      expect(createTaskMock).toHaveBeenCalledWith({
        userId: 4,
        title: 'Title',
        description: 'Desc',
        alertDate: null,
        status: TaskStatus.PENDING,
      })
    })
  })

  it('creates task via repository', async () => {
    createTaskMock.mockResolvedValue({ id: 2 })

    const result = await services.createTask({
      userId: 4,
      title: 'Task',
      description: 'desc',
      status: TaskStatus.PENDING,
    })

    expect(result).toEqual({ data: { id: 2 } })
  })

  it('returns error when createTask fails', async () => {
    createTaskMock.mockRejectedValue(new Error('fail'))

    const result = await services.createTask({
      userId: 4,
      title: 'Task',
      description: 'desc',
      status: TaskStatus.PENDING,
    })

    expect(result.error).toBe('Error al crear la tarea')
  })

  describe('getTasksByUserId', () => {
    it('returns tasks when repository succeeds', async () => {
      const tasks = [{ id: 1 }]
      getTasksByUserIdMock.mockResolvedValue(tasks)

      const result = await services.getTasksByUserId(3)

      expect(result).toEqual({ data: tasks })
    })

    it('returns error when repository fails', async () => {
      getTasksByUserIdMock.mockRejectedValue(new Error('fail'))

      const result = await services.getTasksByUserId(3)

      expect(result.error).toBe('Error al obtener las tareas')
    })
  })

  describe('updateTask', () => {
    it('returns success when update completes', async () => {
      updateTaskMock.mockResolvedValue(undefined)

      const result = await services.updateTask(7, { title: 'New' })

      expect(updateTaskMock).toHaveBeenCalledWith(7, { title: 'New' })
      expect(result).toEqual({ data: true })
    })

    it('returns error when repository throws', async () => {
      updateTaskMock.mockRejectedValue(new Error('fail'))

      const result = await services.updateTask(7, { title: 'New' })

      expect(result.error).toBe('Error al actualizar la tarea')
    })
  })

  describe('deleteTask', () => {
    it('maps delete result to boolean', async () => {
      deleteTaskMock.mockResolvedValueOnce(1).mockResolvedValueOnce(0)

      const success = await services.deleteTask(4, 2)
      const failure = await services.deleteTask(4, 2)

      expect(success).toEqual({ data: true })
      expect(failure).toEqual({ data: false })
    })

    it('returns error when delete fails', async () => {
      deleteTaskMock.mockRejectedValue(new Error('fail'))

      const result = await services.deleteTask(4, 2)

      expect(result.error).toBe('Error al eliminar la tarea')
    })
  })
})
