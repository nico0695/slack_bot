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
  async getTasksByUserId(userId: number): Promise<Tasks[]> {
    try {
      const tasks = await Tasks.find({
        where: { user: { id: userId } },
      })

      return tasks
    } catch (error) {
      return error
    }
  }

  async updateTaskStatus(taskId: number, status: string): Promise<void> {
    try {
      await Tasks.update(
        {
          id: taskId,
        },
        {
          status,
        }
      )
    } catch (error) {
      return error
    }
  }
}
