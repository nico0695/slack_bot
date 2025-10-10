import { formatTimeLeft } from '../dates.utils'

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
