import {
  formatDateToText,
  formatTextToDate,
  formatTimeLeft,
  getRelativeTimeCompact,
  resolveNextCalendarDayAt,
} from '../dates.utils'

const ARGENTINA_TZ = 'America/Argentina/Buenos_Aires'

/**
 * Build a Date from an Argentina wall-clock reading, without reusing the
 * production helper under test.
 */
function argentinaDate(year: number, month: number, day: number, hour: number, minute = 0): Date {
  const pad = (value: number): string => String(value).padStart(2, '0')

  // AR is UTC-3 year round (no DST), so the offset can be written literally here.
  return new Date(`${String(year)}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:00-03:00`)
}

/**
 * Read a Date back as Argentina wall-clock parts, so failures report a readable
 * local time instead of a raw millisecond value.
 */
function argentinaWallClock(date: Date): {
  year: number
  month: number
  day: number
  hour: number
  minute: number
} {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: ARGENTINA_TZ,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  }).formatToParts(date)

  const get = (type: string): number =>
    Number(parts.find((part) => part.type === type)?.value ?? '0')

  const hour = get('hour')

  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: hour === 24 ? 0 : hour,
    minute: get('minute'),
  }
}

describe('formatTimeLeft', () => {
  const mockNow = new Date('2024-01-01T12:00:00Z')

  beforeEach(() => {
    jest.useFakeTimers()
    jest.setSystemTime(mockNow)
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('formats remaining hours and minutes when the target is in the future', () => {
    const target = new Date('2024-01-01T14:30:00Z')

    expect(formatTimeLeft(target)).toBe('2 horas y 30 minutos')
  })

  it('returns an expired alert message when the target is in the past', () => {
    const target = new Date('2023-12-31T12:00:00Z')

    expect(formatTimeLeft(target)).toBe('Alerta vencida')
  })
})

describe('formatTextToDate', () => {
  const mockNow = new Date('2024-02-01T10:00:00Z')

  beforeEach(() => {
    jest.useFakeTimers()
    jest.setSystemTime(mockNow)
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('interprets absolute dates as Argentina local time', () => {
    const naiveDate = new Date('2024-05-10 12:30')
    const argOffsetMinutes = 180
    const serverOffsetMinutes = new Date().getTimezoneOffset()
    const expected = new Date(
      naiveDate.getTime() + (argOffsetMinutes - serverOffsetMinutes) * 60000
    )

    expect(formatTextToDate('2024-05-10 12:30')).toEqual(expected)
  })

  it('parses relative hours from now', () => {
    const result = formatTextToDate('1h')

    expect(result.toISOString()).toBe(new Date(mockNow.getTime() + 60 * 60 * 1000).toISOString())
  })
})

describe('formatDateToText', () => {
  it('injects the default Buenos Aires timezone when not provided', () => {
    const spy = jest.spyOn(Intl, 'DateTimeFormat')
    const sampleDate = new Date('2024-03-10T15:00:00Z')

    formatDateToText(sampleDate, 'es')

    const optionsArg = spy.mock.calls[0][1]
    expect(optionsArg?.timeZone).toBe('America/Argentina/Buenos_Aires')

    spy.mockRestore()
  })

  it('respects explicit timezone overrides', () => {
    const result = formatDateToText(new Date('2024-06-01T00:00:00Z'), 'en', {
      year: 'numeric',
      timeZone: 'UTC',
    })

    expect(result).toBe('2024')
  })
})

describe('getRelativeTimeCompact', () => {
  const baseDate = new Date('2024-01-15T12:00:00Z')

  it('returns minutes for times less than 1 hour away', () => {
    const target = new Date('2024-01-15T12:30:00Z')
    expect(getRelativeTimeCompact(target, baseDate)).toBe('30m')
  })

  it('returns hours for times less than 24 hours away', () => {
    const target = new Date('2024-01-15T15:00:00Z')
    expect(getRelativeTimeCompact(target, baseDate)).toBe('3h')
  })

  it('returns overdue minutes for recent past', () => {
    const target = new Date('2024-01-15T11:30:00Z')
    expect(getRelativeTimeCompact(target, baseDate)).toBe('venc30m')
  })

  it('returns overdue hours for times more than 1 hour past', () => {
    const target = new Date('2024-01-15T09:00:00Z')
    expect(getRelativeTimeCompact(target, baseDate)).toBe('venc3h')
  })

  it('returns 0m for current time', () => {
    expect(getRelativeTimeCompact(baseDate, baseDate)).toBe('0m')
  })
})

describe('resolveNextCalendarDayAt (AC-8)', () => {
  it('resolves an evening base to the next Argentina calendar day at 09:00', () => {
    const base = argentinaDate(2026, 8, 1, 22, 0)

    expect(argentinaWallClock(resolveNextCalendarDayAt(base, 9, 0))).toEqual({
      year: 2026,
      month: 8,
      day: 2,
      hour: 9,
      minute: 0,
    })
  })

  it('resolves a pre-09:00 base to the NEXT day, never the same day', () => {
    const base = argentinaDate(2026, 8, 1, 8, 0)

    expect(argentinaWallClock(resolveNextCalendarDayAt(base, 9, 0))).toEqual({
      year: 2026,
      month: 8,
      day: 2,
      hour: 9,
      minute: 0,
    })
  })

  it('resolves midnight and end-of-day bases to the same next calendar day', () => {
    const midnight = argentinaDate(2026, 8, 1, 0, 0)
    const endOfDay = argentinaDate(2026, 8, 1, 23, 59)

    const expected = { year: 2026, month: 8, day: 2, hour: 9, minute: 0 }

    expect(argentinaWallClock(resolveNextCalendarDayAt(midnight, 9, 0))).toEqual(expected)
    expect(argentinaWallClock(resolveNextCalendarDayAt(endOfDay, 9, 0))).toEqual(expected)
  })

  it('rolls over a month boundary', () => {
    const base = argentinaDate(2026, 8, 31, 22, 0)

    expect(argentinaWallClock(resolveNextCalendarDayAt(base, 9, 0))).toEqual({
      year: 2026,
      month: 9,
      day: 1,
      hour: 9,
      minute: 0,
    })
  })

  it('rolls over a year boundary', () => {
    const base = argentinaDate(2026, 12, 31, 23, 30)

    expect(argentinaWallClock(resolveNextCalendarDayAt(base, 9, 0))).toEqual({
      year: 2027,
      month: 1,
      day: 1,
      hour: 9,
      minute: 0,
    })
  })

  it('rolls over a leap-day boundary', () => {
    const base = argentinaDate(2028, 2, 28, 10, 0)

    expect(argentinaWallClock(resolveNextCalendarDayAt(base, 9, 0))).toEqual({
      year: 2028,
      month: 2,
      day: 29,
      hour: 9,
      minute: 0,
    })
  })

  it('defaults minute to 0 and honours an explicit minute', () => {
    const base = argentinaDate(2026, 8, 1, 12, 0)

    expect(argentinaWallClock(resolveNextCalendarDayAt(base, 9))).toEqual({
      year: 2026,
      month: 8,
      day: 2,
      hour: 9,
      minute: 0,
    })
    expect(argentinaWallClock(resolveNextCalendarDayAt(base, 7, 45))).toEqual({
      year: 2026,
      month: 8,
      day: 2,
      hour: 7,
      minute: 45,
    })
  })
})
