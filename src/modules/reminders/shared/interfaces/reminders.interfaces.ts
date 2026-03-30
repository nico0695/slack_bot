import {
  ReminderRecurrenceType,
  ReminderScope,
  ReminderStatus,
  ReminderWeekDay,
} from '../constants/reminders.constants'
import { Profiles } from '../../../../shared/constants/auth.constants'

export interface IReminder {
  id?: number
  message: string
  recurrenceType: ReminderRecurrenceType
  timeOfDay: string
  weekDays?: ReminderWeekDay[] | null
  monthDays?: number[] | null
  status?: ReminderStatus
  nextTriggerAt?: Date
  lastTriggeredAt?: Date | null
  channelId?: string | null
  userId: number
}

export interface IReminderScopeFilter {
  scope?: ReminderScope
  channelId?: string | null
  status?: ReminderStatus
  page?: number
  pageSize?: number
}

export interface IReminderCheck {
  reminderId: number
  occurrenceDate: string
  checkedByUserId: number
  checkedAt?: Date
}

export interface IReminderValidationResult {
  isValid: boolean
  error?: string
}

export interface IReminderAccessContext {
  userId: number
  profile?: Profiles
}

export interface IReminderTriggerResult {
  reminderId: number
  occurrenceDate: string
  lastTriggeredAt: Date
  nextTriggerAt: Date
}
