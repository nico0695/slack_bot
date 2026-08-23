import { parseSnoozeDuration, MAX_SNOOZE_MINUTES } from '../snoozeDuration.utils'

describe('parseSnoozeDuration', () => {
  describe('accepted forms', () => {
    it('returns none for absent input', () => {
      expect(parseSnoozeDuration(undefined)).toEqual({ kind: 'none' })
    })

    it('returns none for empty/whitespace-only input', () => {
      expect(parseSnoozeDuration('')).toEqual({ kind: 'none' })
      expect(parseSnoozeDuration('   ')).toEqual({ kind: 'none' })
    })

    it('parses minutes (Nm)', () => {
      expect(parseSnoozeDuration('30m')).toEqual({
        kind: 'minutes',
        minutes: 30,
        amount: 30,
        unit: 'm',
      })
    })

    it('parses hours (Nh) into minutes', () => {
      expect(parseSnoozeDuration('2h')).toEqual({
        kind: 'minutes',
        minutes: 120,
        amount: 2,
        unit: 'h',
      })
    })

    it('parses days (Nd) into minutes (N * 1440)', () => {
      expect(parseSnoozeDuration('2d')).toEqual({
        kind: 'minutes',
        minutes: 2880,
        amount: 2,
        unit: 'd',
      })
    })

    it('is case-insensitive for the unit suffix', () => {
      expect(parseSnoozeDuration('2D')).toEqual({
        kind: 'minutes',
        minutes: 2880,
        amount: 2,
        unit: 'd',
      })
    })

    it('accepts a duration exactly at the 60-day maximum', () => {
      expect(parseSnoozeDuration('60d')).toEqual({
        kind: 'minutes',
        minutes: MAX_SNOOZE_MINUTES,
        amount: 60,
        unit: 'd',
      })
    })

    it.each(['mañana', 'manana', 'tomorrow'])(
      'parses bare "%s" as the tomorrow preset',
      (token) => {
        expect(parseSnoozeDuration(token)).toEqual({ kind: 'presetTomorrow' })
      }
    )

    it.each(['Mañana', 'MANANA', 'Tomorrow'])(
      'is case-insensitive for the bare tomorrow token ("%s")',
      (token) => {
        expect(parseSnoozeDuration(token)).toEqual({ kind: 'presetTomorrow' })
      }
    )

    it.each(['mañana', 'manana', 'tomorrow'])(
      'parses "%s HH" (bare hour) as a calendar time with minute 0',
      (token) => {
        expect(parseSnoozeDuration(`${token} 14`)).toEqual({
          kind: 'calendarTime',
          hour: 14,
          minute: 0,
        })
      }
    )

    it.each(['mañana', 'manana', 'tomorrow'])(
      'parses "%s HH:mm" as a calendar time with explicit minute',
      (token) => {
        expect(parseSnoozeDuration(`${token} 14:30`)).toEqual({
          kind: 'calendarTime',
          hour: 14,
          minute: 30,
        })
      }
    )

    it('accepts hour/minute boundary values (00:00 and 23:59)', () => {
      expect(parseSnoozeDuration('mañana 0:00')).toEqual({
        kind: 'calendarTime',
        hour: 0,
        minute: 0,
      })
      expect(parseSnoozeDuration('mañana 23:59')).toEqual({
        kind: 'calendarTime',
        hour: 23,
        minute: 59,
      })
    })

    it('trims surrounding whitespace before parsing', () => {
      expect(parseSnoozeDuration('  30m  ')).toEqual({
        kind: 'minutes',
        minutes: 30,
        amount: 30,
        unit: 'm',
      })
      expect(parseSnoozeDuration('  mañana 14:30  ')).toEqual({
        kind: 'calendarTime',
        hour: 14,
        minute: 30,
      })
    })
  })

  describe('rejected forms', () => {
    it('rejects a zero-amount duration', () => {
      expect(parseSnoozeDuration('0m')).toEqual({ kind: 'invalid' })
    })

    it('rejects a negative-amount duration', () => {
      expect(parseSnoozeDuration('-5m')).toEqual({ kind: 'invalid' })
    })

    it('rejects a non-numeric amount', () => {
      expect(parseSnoozeDuration('abcm')).toEqual({ kind: 'invalid' })
    })

    it('rejects an unrecognized unit', () => {
      expect(parseSnoozeDuration('30x')).toEqual({ kind: 'invalid' })
    })

    it('rejects a duration exceeding the 60-day maximum, tagged with reason "exceedsMax"', () => {
      expect(parseSnoozeDuration('61d')).toEqual({ kind: 'invalid', reason: 'exceedsMax' })
    })

    it('rejects an out-of-range hour (mañana 25)', () => {
      expect(parseSnoozeDuration('mañana 25')).toEqual({ kind: 'invalid' })
    })

    it('rejects an out-of-range minute (mañana 14:75)', () => {
      expect(parseSnoozeDuration('mañana 14:75')).toEqual({ kind: 'invalid' })
    })

    it('rejects unrelated free text', () => {
      expect(parseSnoozeDuration('not a duration')).toEqual({ kind: 'invalid' })
    })

    it('rejects a tomorrow token with garbage trailing the time', () => {
      expect(parseSnoozeDuration('mañana 14:30pm')).toEqual({ kind: 'invalid' })
    })
  })
})
