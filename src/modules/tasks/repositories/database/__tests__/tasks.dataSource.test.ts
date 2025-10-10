import { Tasks } from '../../../../../entities/tasks'
import { TaskStatus } from '../../../shared/constants/tasks.constants'
import TasksDataSource from '../tasks.dataSource'

describe('TasksDataSource', () => {
  const dataSource = TasksDataSource.getInstance()

  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe('createTask', () => {
    it('saves task with default alert date', async () => {
      jest.spyOn(Tasks.prototype as any, 'save').mockImplementation(
        async function (this: Tasks) {
          return this
        }
      )

      const result = await dataSource.createTask({
        userId: 6,
        title: 'Task',
        description: 'desc',
        status: TaskStatus.PENDING,
      })

      expect(result).toBeInstanceOf(Tasks)
      expect(result.user.id).toBe(6)
      expect(result.alertDate).toBeNull()
    })

    it('returns error when save fails', async () => {
      const error = new Error('fail')
      jest.spyOn(Tasks.prototype as any, 'save').mockRejectedValue(error)

      const result = await dataSource.createTask({
        userId: 6,
        title: 'Task',
        description: 'desc',
        status: TaskStatus.PENDING,
      })

      expect(result).toBe(error)
    })
  })

  it('retrieves tasks by user id', async () => {
    const tasks = [{ id: 1 }] as any
    const findSpy = jest.spyOn(Tasks, 'find').mockResolvedValue(tasks)

    const result = await dataSource.getTasksByUserId(7)

    expect(findSpy).toHaveBeenCalledWith({
      where: { user: { id: 7 } },
    })
    expect(result).toBe(tasks)
  })

  it('updates task with sanitized payload', async () => {
    const updateSpy = jest.spyOn(Tasks, 'update').mockResolvedValue({} as any)

    await dataSource.updateTask(5, {
      id: 5,
      userId: 6,
      title: 'Updated',
      description: 'desc',
      status: TaskStatus.COMPLETED,
    })

    expect(updateSpy).toHaveBeenCalledWith(5, {
      title: 'Updated',
      description: 'desc',
      status: TaskStatus.COMPLETED,
    })
  })

  describe('deleteTask', () => {
    it('returns affected rows', async () => {
      jest.spyOn(Tasks, 'delete').mockResolvedValue({ affected: 2 } as any)

      const result = await dataSource.deleteTask(8, 3)

      expect(Tasks.delete).toHaveBeenCalledWith({
        id: 8,
        user: { id: 3 },
      })
      expect(result).toBe(2)
    })

    it('returns zero when nothing deleted', async () => {
      jest.spyOn(Tasks, 'delete').mockResolvedValue({ affected: undefined } as any)

      const result = await dataSource.deleteTask(8, 3)

      expect(result).toBe(0)
    })

    it('throws wrapped error when delete fails', async () => {
      jest.spyOn(Tasks, 'delete').mockRejectedValue('boom')

      await expect(dataSource.deleteTask(8, 3)).rejects.toThrow('boom')
    })
  })
})
