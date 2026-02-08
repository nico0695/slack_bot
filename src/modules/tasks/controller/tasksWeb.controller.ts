/* eslint-disable @typescript-eslint/no-misused-promises */
import { Router } from 'express'

import GenericController from '../../../shared/modules/genericController'
import BadRequestError from '../../../shared/utils/errors/BadRequestError'
import { validateBody, validateParams, idParamSchema } from '../../../shared/utils/validation'

import TasksServices from '../services/tasks.services'

import { ITask } from '../shared/interfaces/tasks.interfaces'
import { createTaskSchema, updateTaskSchema } from '../shared/schemas/tasks.schemas'
import { HttpAuth, Permission } from '../../../shared/middleware/auth'
import { Profiles } from '../../../shared/constants/auth.constants'

export default class TasksWebController extends GenericController {
  private static instance: TasksWebController

  public router: Router

  private tasksServices: TasksServices

  private constructor() {
    super()
    this.createTask = this.createTask.bind(this)
    this.getTasks = this.getTasks.bind(this)
    this.deleteTask = this.deleteTask.bind(this)
    this.updateTask = this.updateTask.bind(this)

    this.tasksServices = TasksServices.getInstance()

    this.router = Router()
    this.registerRoutes()
  }

  static getInstance(): TasksWebController {
    if (this.instance) {
      return this.instance
    }

    this.instance = new TasksWebController()
    return this.instance
  }

  /** Tasks Routes */

  protected registerRoutes(): void {
    this.router.get('/', this.getTasks)
    this.router.post('/', this.createTask)
    this.router.put('/:id', this.updateTask)
    this.router.delete('/:id', this.deleteTask)
  }

  /** Tasks Controllers Methods */

  @HttpAuth
  @Permission([Profiles.USER, Profiles.USER_PREMIUM, Profiles.ADMIN])
  public async createTask(req: any, res: any): Promise<void> {
    const user = this.userData
    const parsed = validateBody(createTaskSchema, req.body)

    const dataTask: ITask = {
      title: parsed.title,
      description: parsed.description,
      status: parsed.status,
      alertDate: parsed.alertDate,
      tag: parsed.tag,
      userId: user.id,
    }

    const response = await this.tasksServices.createTask(dataTask)

    if (response.error) {
      throw new BadRequestError({ message: response.error })
    }

    res.send(response.data)
  }

  @HttpAuth
  @Permission([Profiles.USER, Profiles.USER_PREMIUM, Profiles.ADMIN])
  public async getTasks(req: any, res: any): Promise<void> {
    const user = this.userData

    const response = await this.tasksServices.getTasksByUserId(user.id)

    if (response.error) {
      throw new BadRequestError({ message: response.error })
    }

    res.send(response.data)
  }

  @HttpAuth
  @Permission([Profiles.USER, Profiles.USER_PREMIUM, Profiles.ADMIN])
  public async updateTask(req: any, res: any): Promise<void> {
    const { id: taskId } = validateParams(idParamSchema, req.params)
    const user = this.userData
    const parsed = validateBody(updateTaskSchema, req.body)

    const dataTask: ITask = {
      id: taskId,
      title: parsed.title,
      description: parsed.description,
      status: parsed.status,
      alertDate: parsed.alertDate,
      tag: parsed.tag,
      userId: user.id,
    }

    const response = await this.tasksServices.updateTask(taskId, dataTask)

    if (response.error) {
      throw new BadRequestError({ message: response.error })
    }

    res.send(response.data)
  }

  @HttpAuth
  @Permission([Profiles.USER, Profiles.USER_PREMIUM, Profiles.ADMIN])
  public async deleteTask(req: any, res: any): Promise<void> {
    const { id: taskId } = validateParams(idParamSchema, req.params)
    const user = this.userData

    const response = await this.tasksServices.deleteTask(taskId, user.id)

    if (response.error) {
      throw new BadRequestError({ message: response.error })
    }

    res.send(response.data)
  }
}
