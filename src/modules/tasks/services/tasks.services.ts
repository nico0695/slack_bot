import { Tasks } from '../../../entities/tasks'
import { GenericResponse } from '../../../shared/interfaces/services'

import TasksDataSource from '../repositories/database/tasks.dataSource'

import { formatTextToDate } from '../../../shared/utils/dates.utils'
import { TaskStatus } from '../shared/constants/tasks.constants'
import { ITask } from '../shared/interfaces/tasks.interfaces'
import { createModuleLogger } from '../../../config/logger'

const log = createModuleLogger('tasks.service')

export default class TasksServices {
  private static instance: TasksServices

  private tasksDataSource: TasksDataSource

  private constructor() {
    this.tasksDataSource = TasksDataSource.getInstance()
  }

  static getInstance(): TasksServices {
    if (this.instance) {
      return this.instance
    }

    this.instance = new TasksServices()
    return this.instance
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
      tag?: string
      channelId?: string
    } = {}
  ): Promise<GenericResponse<Tasks>> {
    try {
      const sanitizedTag = options.tag?.trim()
      const payload: ITask = {
        userId,
        title,
        description,
        alertDate: options.alertDate ? formatTextToDate(options.alertDate) : null,
        status: options.status ?? TaskStatus.PENDING,
      }

      if (sanitizedTag && sanitizedTag.length > 0) {
        payload.tag = sanitizedTag
      }

      if (options.channelId) {
        payload.channelId = options.channelId
      }

      const response = await this.tasksDataSource.createTask(payload)

      log.info({ userId, taskId: response.id }, 'Task created')

      return {
        data: response,
      }
    } catch (error) {
      log.error({ err: error, userId }, 'createAssistantTask failed')
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
      const response = await this.tasksDataSource.createTask(data)

      log.info({ userId: data.userId, taskId: response.id }, 'Task created')

      return {
        data: response,
      }
    } catch (error) {
      log.error({ err: error, userId: data.userId }, 'createTask failed')
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
  public async getTasksByUserId(
    userId: number,
    options?: {
      tag?: string
      channelId?: string | null
    }
  ): Promise<GenericResponse<Tasks[]>> {
    try {
      const response = await this.tasksDataSource.getTasksByUserId(userId, options)

      return {
        data: response,
      }
    } catch (error) {
      log.error({ err: error, userId }, 'getTasksByUserId failed')
      return {
        error: 'Error al obtener las tareas',
      }
    }
  }

  public async updateTask(
    taskId: number,
    dataUpdate: Partial<ITask>
  ): Promise<GenericResponse<boolean>> {
    try {
      await this.tasksDataSource.updateTask(taskId, dataUpdate)

      return {
        data: true,
      }
    } catch (error) {
      log.error({ err: error, taskId }, 'updateTask failed')
      return {
        error: 'Error al actualizar la tarea',
      }
    }
  }

  public async deleteTask(taskId: number, userId: number): Promise<GenericResponse<boolean>> {
    try {
      const res = await this.tasksDataSource.deleteTask(taskId, userId)

      log.info({ taskId, userId }, 'Task deleted')

      return {
        data: res > 0,
      }
    } catch (error) {
      log.error({ err: error, taskId, userId }, 'deleteTask failed')
      return {
        error: 'Error al eliminar la tarea',
      }
    }
  }
}
