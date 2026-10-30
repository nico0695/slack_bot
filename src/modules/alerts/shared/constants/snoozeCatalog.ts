import {
  resolveNextCalendarDayAt,
  resolveTomorrowAtSameLocalTime,
} from '../../../../shared/utils/dates.utils'

const MINUTE_IN_MS = 60 * 1000

const TOMORROW_HOUR = 9
const TOMORROW_MINUTE = 0

/** Inputs every preset rule may use: the server clock and the alert's current date. */
export interface ISnoozeContext {
  now: Date
  scheduledAt: Date
}

/**
 * `snooze_5m` / `snooze_1h` action values must stay byte-identical: messages
 * already in users' Slack history carry them. Keys must stay lowercase-safe —
 * `parseSlackAction` lowercases and matches `^([a-z]+):([a-z0-9_-]+):(\d+)$`.
 *
 * `resolveTargetDate` is a closure rather than a minute count so relative and
 * calendar-rule presets dispatch identically, with no branch per preset.
 */
export interface ISnoozePreset {
  key: string
  label: string
  actionValue: (id: number) => string
  resolveTargetDate: (context: ISnoozeContext) => Date
}

/**
 * Separate axis from `ISnoozePreset`: a preference is a stored minute value, and
 * `tomorrow` is not expressible as one.
 */
export interface IPreferencePreset {
  key: string
  minutes: number
  label: string
}

/** Relative rule: `max(now, scheduledAt) + minutes`. */
const relativeMinutes = (minutes: number): ((context: ISnoozeContext) => Date) => {
  return ({ now, scheduledAt }: ISnoozeContext): Date =>
    new Date(Math.max(now.getTime(), scheduledAt.getTime()) + minutes * MINUTE_IN_MS)
}

/** Visible presets, in menu order. Also the exact set accepted by the REST endpoint. */
export const snoozePresets: ISnoozePreset[] = [
  {
    key: 'snooze_5m',
    label: 'Snooze 5 min',
    actionValue: (id: number): string => `alert:snooze_5m:${id}`,
    resolveTargetDate: relativeMinutes(5),
  },
  {
    key: 'snooze_1h',
    label: 'Snooze 1 hora',
    actionValue: (id: number): string => `alert:snooze_1h:${id}`,
    resolveTargetDate: relativeMinutes(60),
  },
  {
    key: 'snooze_tomorrow_same_time',
    label: 'Same time tomorrow',
    actionValue: (id: number): string => `alert:snooze_tomorrow_same_time:${id}`,
    resolveTargetDate: ({ now, scheduledAt }: ISnoozeContext): Date =>
      resolveTomorrowAtSameLocalTime(scheduledAt, now),
  },
]

/**
 * Presets no menu renders. `snooze_tomorrow` (09:00) is still used by the
 * `snooze #id mañana` text command.
 */
export const hiddenSnoozePresets: ISnoozePreset[] = [
  {
    key: 'snooze_tomorrow',
    label: 'Mañana 9:00',
    actionValue: (id: number): string => `alert:snooze_tomorrow:${id}`,
    resolveTargetDate: ({ now, scheduledAt }: ISnoozeContext): Date =>
      resolveNextCalendarDayAt(
        scheduledAt > now ? scheduledAt : now,
        TOMORROW_HOUR,
        TOMORROW_MINUTE
      ),
  },
]

export const findSnoozePreset = (key: string): ISnoozePreset | undefined =>
  [...snoozePresets, ...hiddenSnoozePresets].find((preset) => preset.key === key)

/**
 * Target date of a preset, or null when the key is unknown
 * @param key string - Preset key
 * @param scheduledAt Date - Current alert date
 * @param now Date - Server clock
 */
export const resolveSnoozeTarget = (key: string, scheduledAt: Date, now: Date): Date | null => {
  const preset = findSnoozePreset(key)

  return preset ? preset.resolveTargetDate({ now, scheduledAt }) : null
}

export const preferencePresets: IPreferencePreset[] = [
  { key: 'set_snooze_5m', minutes: 5, label: '5 minutos' },
  { key: 'set_snooze_10m', minutes: 10, label: '10 minutos' },
  { key: 'set_snooze_30m', minutes: 30, label: '30 minutos' },
]
