import { Router } from 'express'
import { injectable } from 'tsyringe'

import GenericController from '../../../shared/modules/genericController'
import BadRequestError from '../../../shared/utils/errors/BadRequestError'
import {
  validateBody,
  validateQuery,
  validateParams,
  idParamSchema,
} from '../../../shared/utils/validation'

import { HttpAuth, Permission } from '../../../shared/middleware/auth'
import { Profiles } from '../../../shared/constants/auth.constants'

import RemindersServices from '../services/reminders.services'
import { IReminder } from '../shared/interfaces/reminders.interfaces'
import {
  checkReminderSchema,
  createReminderSchema,
  getRemindersQuerySchema,
} from '../shared/schemas/reminders.schemas'

@injectable()
export default class RemindersWebController extends GenericController {
  public router: Router

  constructor(private remindersServices: RemindersServices) {
    super()
    this.createReminder = this.createReminder.bind(this)
    this.getReminders = this.getReminders.bind(this)
    this.getReminder = this.getReminder.bind(this)
    this.pauseReminder = this.pauseReminder.bind(this)
    this.resumeReminder = this.resumeReminder.bind(this)
    this.checkReminder = this.checkReminder.bind(this)
    this.deleteReminder = this.deleteReminder.bind(this)

    this.router = Router()
    this.registerRoutes()
  }

  protected registerRoutes(): void {
    this.router.get('/', this.getReminders)
    this.router.get('/:id', this.getReminder)
    this.router.post('/', this.createReminder)
    this.router.post('/:id/pause', this.pauseReminder)
    this.router.post('/:id/resume', this.resumeReminder)
    this.router.post('/:id/check', this.checkReminder)
    this.router.delete('/:id', this.deleteReminder)
  }

  @HttpAuth
  @Permission([Profiles.USER, Profiles.USER_PREMIUM, Profiles.ADMIN])
  public async createReminder(req: any, res: any): Promise<void> {
    const user = this.userData
    const parsed = validateBody(createReminderSchema, req.body)

    const reminderPayload: IReminder = {
      message: parsed.message,
      recurrenceType: parsed.recurrenceType,
      timeOfDay: parsed.timeOfDay,
      weekDays: parsed.weekDays,
      monthDays: parsed.monthDays,
      status: parsed.status,
      channelId: parsed.channelId ?? null,
      userId: user.id,
    }

    const response = await this.remindersServices.createReminder(reminderPayload)

    if (response.error) {
      throw new BadRequestError({ message: response.error })
    }

    res.send(response.data)
  }

  @HttpAuth
  @Permission([Profiles.USER, Profiles.USER_PREMIUM, Profiles.ADMIN])
  public async getReminders(req: any, res: any): Promise<void> {
    const user = this.userData
    const options = validateQuery(getRemindersQuerySchema, req.query)

    const response = await this.remindersServices.getRemindersByScope(user.id, options)

    if (response.error) {
      throw new BadRequestError({ message: response.error })
    }

    res.send(response.data)
  }

  @HttpAuth
  @Permission([Profiles.USER, Profiles.USER_PREMIUM, Profiles.ADMIN])
  public async getReminder(req: any, res: any): Promise<void> {
    const { id: reminderId } = validateParams(idParamSchema, req.params)
    const user = this.userData
    const response = await this.remindersServices.getReminderById(reminderId, {
      userId: user.id,
      profile: user.profile,
    })

    if (response.error) {
      throw new BadRequestError({ message: response.error })
    }

    res.send(response.data)
  }

  @HttpAuth
  @Permission([Profiles.USER, Profiles.USER_PREMIUM, Profiles.ADMIN])
  public async pauseReminder(req: any, res: any): Promise<void> {
    const { id: reminderId } = validateParams(idParamSchema, req.params)
    const user = this.userData
    const response = await this.remindersServices.pauseReminder(reminderId, {
      userId: user.id,
      profile: user.profile,
    })

    if (response.error) {
      throw new BadRequestError({ message: response.error })
    }

    res.send(response.data)
  }

  @HttpAuth
  @Permission([Profiles.USER, Profiles.USER_PREMIUM, Profiles.ADMIN])
  public async resumeReminder(req: any, res: any): Promise<void> {
    const { id: reminderId } = validateParams(idParamSchema, req.params)
    const user = this.userData
    const response = await this.remindersServices.resumeReminder(reminderId, {
      userId: user.id,
      profile: user.profile,
    })

    if (response.error) {
      throw new BadRequestError({ message: response.error })
    }

    res.send(response.data)
  }

  @HttpAuth
  @Permission([Profiles.USER, Profiles.USER_PREMIUM, Profiles.ADMIN])
  public async checkReminder(req: any, res: any): Promise<void> {
    const { id: reminderId } = validateParams(idParamSchema, req.params)
    const user = this.userData
    validateBody(checkReminderSchema, req.body ?? {})

    const response = await this.remindersServices.checkReminderOccurrence(reminderId, {
      userId: user.id,
      profile: user.profile,
    })

    if (response.error) {
      throw new BadRequestError({ message: response.error })
    }

    res.send(response.data)
  }

  @HttpAuth
  @Permission([Profiles.USER, Profiles.USER_PREMIUM, Profiles.ADMIN])
  public async deleteReminder(req: any, res: any): Promise<void> {
    const { id: reminderId } = validateParams(idParamSchema, req.params)
    const user = this.userData

    const response = await this.remindersServices.deleteReminder(reminderId, {
      userId: user.id,
      profile: user.profile,
    })

    if (response.error) {
      throw new BadRequestError({ message: response.error })
    }

    res.send(response.data)
  }
}
