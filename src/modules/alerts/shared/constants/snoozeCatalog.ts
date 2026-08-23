import { resolveNextCalendarDayAt } from '../../../../shared/utils/dates.utils'

const MINUTE_IN_MS = 60 * 1000

const TOMORROW_HOUR = 9
const TOMORROW_MINUTE = 0

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
  resolveTargetDate: (base: Date) => Date
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

const relativeMinutes = (minutes: number): ((base: Date) => Date) => {
  return (base: Date): Date => new Date(base.getTime() + minutes * MINUTE_IN_MS)
}

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
    key: 'snooze_tomorrow',
    label: 'Mañana 9:00',
    actionValue: (id: number): string => `alert:snooze_tomorrow:${id}`,
    resolveTargetDate: (base: Date): Date =>
      resolveNextCalendarDayAt(base, TOMORROW_HOUR, TOMORROW_MINUTE),
  },
]

export const preferencePresets: IPreferencePreset[] = [
  { key: 'set_snooze_5m', minutes: 5, label: '5 minutos' },
  { key: 'set_snooze_10m', minutes: 10, label: '10 minutos' },
  { key: 'set_snooze_30m', minutes: 30, label: '30 minutos' },
]
