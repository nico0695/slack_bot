/**
 * Pure parser shared by the three snooze entry points (keyword, `.a -snooze`,
 * `alert.snooze` intent). `reason: 'exceedsMax'` is set only on the over-cap
 * case, so callers can show a dedicated message instead of the generic one.
 */

export type TSnoozeDurationUnit = 'm' | 'h' | 'd'

export type TParsedSnoozeDuration =
  | { kind: 'none' }
  | { kind: 'minutes'; minutes: number; amount: number; unit: TSnoozeDurationUnit }
  | { kind: 'presetTomorrow' }
  | { kind: 'calendarTime'; hour: number; minute: number }
  | { kind: 'invalid'; reason?: 'exceedsMax' }

const MINUTES_PER_UNIT: Record<TSnoozeDurationUnit, number> = {
  m: 1,
  h: 60,
  d: 60 * 24,
}

/** 60 days, expressed in minutes — a typo guard, not a technical ceiling. */
export const MAX_SNOOZE_MINUTES = 60 * 24 * 60

const TOMORROW_TOKENS = ['mañana', 'manana', 'tomorrow']

const DURATION_PATTERN = /^(\d+)\s*([mhd])$/
const TOMORROW_BARE_PATTERN = new RegExp(`^(?:${TOMORROW_TOKENS.join('|')})$`)
const TOMORROW_TIME_PATTERN = new RegExp(
  `^(?:${TOMORROW_TOKENS.join('|')})\\s+(\\d{1,2})(?::(\\d{1,2}))?$`
)

export const parseSnoozeDuration = (raw?: string): TParsedSnoozeDuration => {
  const trimmed = raw?.trim()

  if (!trimmed) {
    return { kind: 'none' }
  }

  const normalized = trimmed.toLowerCase()

  const durationMatch = normalized.match(DURATION_PATTERN)
  if (durationMatch) {
    const amount = Number(durationMatch[1])
    const unit = durationMatch[2] as TSnoozeDurationUnit

    if (!Number.isFinite(amount) || amount <= 0) {
      return { kind: 'invalid' }
    }

    const minutes = amount * MINUTES_PER_UNIT[unit]
    if (minutes > MAX_SNOOZE_MINUTES) {
      return { kind: 'invalid', reason: 'exceedsMax' }
    }

    return { kind: 'minutes', minutes, amount, unit }
  }

  if (TOMORROW_BARE_PATTERN.test(normalized)) {
    return { kind: 'presetTomorrow' }
  }

  const timeMatch = normalized.match(TOMORROW_TIME_PATTERN)
  if (timeMatch) {
    const hour = Number(timeMatch[1])
    const minute = timeMatch[2] !== undefined ? Number(timeMatch[2]) : 0

    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
      return { kind: 'invalid' }
    }

    return { kind: 'calendarTime', hour, minute }
  }

  return { kind: 'invalid' }
}
