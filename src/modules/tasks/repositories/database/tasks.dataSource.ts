import { Tasks } from '../../../../entities/tasks'
import { Users } from '../../../../entities/users'

import { ITask } from '../../shared/interfaces/tasks.interfaces'

export default class TasksDataSource {
  static #instance: TasksDataSource

  private constructor() {}

  static getInstance(): TasksDataSource {
    if (this.#instance) {
      return this.#instance
    }

    this.#instance = new TasksDataSource()
    return this.#instance
  }

  /**
   * Save task in database
   * @param data ITask
   * @returns
   */
  async createTask(data: ITask): Promise<Tasks> {
    try {
      const user = new Users()
      user.id = data.userId

      const newTask = new Tasks()

      newTask.title = data.title
      newTask.description = data.description
      newTask.status = data.status
      newTask.alertDate = data.alertDate ?? null
      const trimmedTag = data.tag?.trim();
      newTask.tag = trimmedTag ? trimmedTag : null
      newTask.user = user

      await newTask.save()

      return newTask
    } catch (error) {
      return error
    }
  }

  /**
   * Get tasks by user id
   * @param userId number - User id
   * @returns
   */
  async getTasksByUserId(
    userId: number,
    options?: {
      tag?: string
    }
  ): Promise<Tasks[]> {
    try {
      const where: { user: { id: number }; tag?: string } = { user: { id: userId } }

      if (options?.tag) {
        where.tag = options.tag
      }

      const tasks = await Tasks.find({
        where,
      })

      return tasks
    } catch (error) {
      return error
    }
  }

  async updateTask(taskId: number, dataUpdate: Partial<ITask>): Promise<void> {
    try {
      const data = { ...dataUpdate }
      delete data.userId
      delete data.id

      await Tasks.update(taskId, data)
    } catch (error) {
      throw new Error('Error al actualizar la tarea')
    }
  }

  async deleteTask(taskId: number, userId: number): Promise<number> {
    try {
      const result = await Tasks.delete({
        id: taskId,
        user: { id: userId },
      })
      return result.affected ?? 0
    } catch (error) {
      throw new Error(error)
    }
  }
}
