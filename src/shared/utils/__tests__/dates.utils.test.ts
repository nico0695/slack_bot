import { formatDateToText, formatTextToDate, formatTimeLeft } from '../dates.utils'

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
    const expected = new Date(naiveDate.getTime() + (argOffsetMinutes - serverOffsetMinutes) * 60000)

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
