import { Tasks } from '../../../entities/tasks'
import { GenericResponse } from '../../../shared/interfaces/services'

import TasksDataSource from '../repositories/database/tasks.dataSource'
import { UsersRedis } from '../../users/repositories/redis/users.redis'

import { formatTextToDate } from '../../../shared/utils/dates.utils'
import { TaskStatus } from '../shared/constants/tasks.constants'
import { ITask } from '../shared/interfaces/tasks.interfaces'

export default class TasksServices {
  static #instance: TasksServices

  #tasksDataSource: TasksDataSource
  #usersRedis: UsersRedis

  private constructor() {
    this.#tasksDataSource = TasksDataSource.getInstance()
    this.#usersRedis = UsersRedis.getInstance()
  }

  static getInstance(): TasksServices {
    if (this.#instance) {
      return this.#instance
    }

    this.#instance = new TasksServices()
    return this.#instance
  }

  /**
   * Create task with user assistant data
   * @param userId
   * @param dateText
   * @param message
   * @returns
   */
  public async createAssistantTask(
    userId: number,
    title: string,
    description: string,
    options: {
      alertDate?: string
      status?: TaskStatus
    } = {}
  ): Promise<GenericResponse<Tasks>> {
    try {
      const response = await this.#tasksDataSource.createTask({
        userId,
        title,
        description,
        alertDate: options.alertDate ? formatTextToDate(options.alertDate) : null,
        status: options.status ?? TaskStatus.PENDING,
      })

      return {
        data: response,
      }
    } catch (error) {
      return {
        error: 'Error al crear la tarea',
      }
    }
  }

  /**
   * Save task in database
   * @param data ITask
   * @returns
   */
  public async createTask(data: ITask): Promise<GenericResponse<Tasks>> {
    try {
      const response = await this.#tasksDataSource.createTask(data)

      return {
        data: response,
      }
    } catch (error) {
      return {
        error: 'Error al crear la tarea',
      }
    }
  }

  /**
   * Get tasks by user id
   * @param userId number - User id
   * @returns
   */
  public async getTasksByUserId(userId: number): Promise<GenericResponse<Tasks[]>> {
    try {
      const response = await this.#tasksDataSource.getTasksByUserId(userId)

      return {
        data: response,
      }
    } catch (error) {
      return {
        error: 'Error al obtener las tareas',
      }
    }
  }

  public async updateTaskStatus(
    taskId: number,
    status: TaskStatus
  ): Promise<GenericResponse<boolean>> {
    try {
      await this.#tasksDataSource.updateTaskStatus(taskId, status)

      return {
        data: true,
      }
    } catch (error) {
      return {
        error: 'Error al actualizar la tarea',
      }
    }
  }
}
