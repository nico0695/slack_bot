import { singleton } from 'tsyringe'

import AlertsServices from './alerts.services'
import { Alerts } from '../../../entities/alerts'
import { findSnoozePreset } from '../shared/constants/snoozeCatalog'

import { RedisRepository } from '../../conversations/repositories/redis/conversations.redis'
import * as slackMsgUtils from '../../../shared/utils/slackMessages.utils'
import { createModuleLogger } from '../../../config/logger'

const log = createModuleLogger('alertInteractions.service')

const MINUTE_IN_MS = 60 * 1000

const DAILY_MINUTES = 24 * 60
const WEEKLY_MINUTES = 7 * 24 * 60

/** Not a snooze catalog entry: it has no fixed target-date rule to render. */
export const SNOOZE_DEFAULT_PRESET_KEY = 'snooze_default'

export const SNOOZE_SCHEDULE_CHANGED_MESSAGE = 'This alert changed. Try again.'

const SNOOZE_FAILED_MESSAGE = 'No se pudo reprogramar la alerta. 😅'

export type TAlertScope = 'pending' | 'all' | 'snoozed' | 'overdue' | 'resolved'

export type TRepeatPolicy = 'daily' | 'weekly'

export interface ISnoozeAlertOptions {
  minutes?: number
  presetKey?: string
  /** Never defaulted here: the button and text-command paths diverge on purpose. */
  updatePreference: boolean
  /** Caller-computed target (e.g. `mañana HH:mm`) that has no fixed catalog preset. */
  resolveTargetDate?: (base: Date) => Date
}

type TMinutesResolution = { minutes: number } | { error: string }

type TBaseResolution = { base: Date } | { error: string }

/**
 * Single home for the alert interactions `conversations.services.ts` (Slack
 * actions) and `messageProcessor.service.ts` (text commands) both delegate to.
 * Separate from `AlertsServices`, which is CRUD/notification-facing: these
 * operations own Slack presentation and the snooze-preference policy.
 */
@singleton()
export default class AlertInteractionsService {
  private defaultSnoozeMinutes = 10

  constructor(private alertsServices: AlertsServices, private redisRepository: RedisRepository) {}

  public getDefaultSnoozeMinutes = async (userId: number): Promise<number> => {
    const config = await this.redisRepository.getAlertSnoozeConfig(userId)
    return config?.defaultSnoozeMinutes ?? this.defaultSnoozeMinutes
  }

  public setDefaultSnoozeMinutes = async (userId: number, minutes: number): Promise<void> => {
    await this.redisRepository.saveAlertSnoozeConfig(userId, { defaultSnoozeMinutes: minutes })
  }

  /**
   * Callers supply exactly one of `minutes` or `presetKey`.
   * Catalog presets go through the shared `AlertsServices.snoozeAlertByPreset`.
   * Minutes keep the `AlertsServices.rescheduleAlert` base rule:
   * new date is `max(now, alert_date) + minutes`.
   */
  public snoozeAlert = async (
    alertId: number,
    userId: number,
    options: ISnoozeAlertOptions
  ): Promise<string | { blocks: any[] }> => {
    if (options.minutes === undefined && options.presetKey !== undefined) {
      const preset = findSnoozePreset(options.presetKey)

      if (preset) {
        return await this.applyPresetSnooze(alertId, userId, preset.key)
      }
    }

    const resolution = await this.resolveSnoozeMinutes(alertId, userId, options)

    if ('error' in resolution) {
      return resolution.error
    }

    return await this.applySnooze(alertId, userId, resolution.minutes, options.updatePreference)
  }

  public repeatAlert = async (
    alertId: number,
    userId: number,
    policy: TRepeatPolicy
  ): Promise<string | { blocks: any[] }> => {
    const minutesToAdd = policy === 'daily' ? DAILY_MINUTES : WEEKLY_MINUTES

    const followUp = await this.alertsServices.createFollowUpAlert(alertId, userId, minutesToAdd)

    if (followUp.error || !followUp.data) {
      return followUp.error ?? 'No se pudo crear la recurrencia. 😅'
    }

    const messageBlock = slackMsgUtils.msgAlertCreated(followUp.data)

    messageBlock.blocks.push({
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `La alerta #${alertId} se repetirá de forma ${
            policy === 'daily' ? 'diaria' : 'semanal'
          }.`,
        },
      ],
    })

    return messageBlock
  }

  public listAlertsByScope = async (
    userId: number,
    scope: TAlertScope,
    channelId: string | null
  ): Promise<string | { blocks: any[] }> => {
    const result = await this.getAlertsByScope(userId, scope, channelId)

    return typeof result === 'string' ? result : slackMsgUtils.msgAlertsList(result)
  }

  /**
   * Alerts of the scope, or the message to show when there are none or the lookup fails
   */
  public getAlertsByScope = async (
    userId: number,
    scope: TAlertScope,
    channelId: string | null
  ): Promise<string | Alerts[]> => {
    const alertsRes = await this.alertsServices.getAlertsByUserId(userId, {
      channelId,
    })
    if (alertsRes.error) {
      return 'No se pudieron obtener las alertas. 😅'
    }

    const alerts = alertsRes.data ?? []
    if (!alerts.length) {
      return 'No tienes alertas guardadas.'
    }

    const now = new Date()

    let filtered = alerts
    let emptyMessage = 'No hay alertas para mostrar.'

    switch (scope) {
      case 'pending':
        filtered = alerts.filter((alert) => !alert.sent)
        emptyMessage = 'No tienes alertas pendientes.'
        break
      case 'snoozed':
        // Snoozed scope removed - show pending alerts instead
        filtered = alerts.filter((alert) => !alert.sent)
        emptyMessage = 'No tienes alertas pendientes.'
        break
      case 'overdue':
        filtered = alerts.filter((alert) => !alert.sent && new Date(alert.date) < now)
        emptyMessage = 'No tienes alertas atrasadas.'
        break
      case 'resolved':
        filtered = alerts.filter((alert) => alert.sent)
        emptyMessage = 'No tienes alertas resueltas.'
        break
      case 'all':
      default:
        filtered = alerts
        emptyMessage = 'No tienes alertas guardadas.'
        break
    }

    if (!filtered.length) {
      return emptyMessage
    }

    return filtered
  }

  /**
   * The expected date is the one just read: Slack messages carry no date, but a
   * concurrent change between this read and the update is still not overwritten
   */
  private applyPresetSnooze = async (
    alertId: number,
    userId: number,
    presetKey: string
  ): Promise<string | { blocks: any[] }> => {
    const alertRes = await this.alertsServices.getAlertById(alertId, userId)

    if (alertRes.error || !alertRes.data) {
      return alertRes.error ?? SNOOZE_FAILED_MESSAGE
    }

    try {
      const result = await this.alertsServices.snoozeAlertByPreset(
        alertId,
        userId,
        presetKey,
        new Date(alertRes.data.date)
      )

      if (result.status === 'not_found') {
        return 'No se encontró la alerta solicitada'
      }

      if (result.status === 'schedule_changed') {
        return SNOOZE_SCHEDULE_CHANGED_MESSAGE
      }

      return slackMsgUtils.msgAlertDetail(
        Object.assign(alertRes.data, { date: result.scheduledAt, sent: false })
      )
    } catch (error) {
      log.error({ err: error, alertId, userId, presetKey }, 'applyPresetSnooze failed')
      return SNOOZE_FAILED_MESSAGE
    }
  }

  private applySnooze = async (
    alertId: number,
    userId: number,
    minutes: number,
    updatePreference: boolean
  ): Promise<string | { blocks: any[] }> => {
    if (!Number.isFinite(minutes) || minutes <= 0) {
      return 'El snooze debe ser mayor a 1 minuto.'
    }

    const res = await this.alertsServices.rescheduleAlert(alertId, userId, minutes)

    if (res.error || !res.data) {
      return res.error ?? 'No se pudo reprogramar la alerta. 😅'
    }

    if (updatePreference) {
      await this.setDefaultSnoozeMinutes(userId, minutes)
    }

    return slackMsgUtils.msgAlertDetail(res.data)
  }

  private resolveSnoozeMinutes = async (
    alertId: number,
    userId: number,
    options: ISnoozeAlertOptions
  ): Promise<TMinutesResolution> => {
    if (options.minutes !== undefined) {
      return { minutes: options.minutes }
    }

    // Additive branch (`resolveTargetDate`): only reached when both `minutes`
    // and `presetKey` are absent, so no existing caller (which always supplies
    // exactly one of them) can hit this path.
    if (options.presetKey === undefined && options.resolveTargetDate) {
      const baseResolution = await this.resolveSnoozeBase(alertId, userId)

      if ('error' in baseResolution) {
        return { error: baseResolution.error }
      }

      const { base } = baseResolution
      const target = options.resolveTargetDate(base)

      return { minutes: (target.getTime() - base.getTime()) / MINUTE_IN_MS }
    }

    if (options.presetKey === SNOOZE_DEFAULT_PRESET_KEY) {
      return { minutes: await this.getDefaultSnoozeMinutes(userId) }
    }

    // Catalog presets were dispatched by `snoozeAlert` already
    return { error: 'Acción no reconocida.' }
  }

  /**
   * Mirrors `AlertsServices.rescheduleAlert`'s own base rule so the resolved
   * target and the reschedule that follows agree.
   */
  private resolveSnoozeBase = async (alertId: number, userId: number): Promise<TBaseResolution> => {
    const alertRes = await this.alertsServices.getAlertById(alertId, userId)

    if (alertRes.error || !alertRes.data) {
      return { error: alertRes.error ?? 'No se pudo reprogramar la alerta. 😅' }
    }

    const now = new Date()
    const alertDate = new Date(alertRes.data.date)

    return { base: alertDate > now ? alertDate : now }
  }
}
