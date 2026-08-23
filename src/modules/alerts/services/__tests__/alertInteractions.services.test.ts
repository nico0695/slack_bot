import AlertInteractionsService, { SNOOZE_DEFAULT_PRESET_KEY } from '../alertInteractions.services'
import { snoozePresets, preferencePresets } from '../../shared/constants/snoozeCatalog'
import * as slackMsgUtilsMock from '../../../../shared/utils/slackMessages.utils'
import { resolveNextCalendarDayAt } from '../../../../shared/utils/dates.utils'

const buildBlocksMock = (): { blocks: any[] } => ({ blocks: [] as any[] })

jest.mock('../../../../shared/utils/slackMessages.utils', () => ({
  msgAlertDetail: jest.fn(() => buildBlocksMock()),
  msgAlertCreated: jest.fn(() => buildBlocksMock()),
  msgAlertsList: jest.fn(() => buildBlocksMock()),
}))

const getAlertSnoozeConfigMock = jest.fn()
const saveAlertSnoozeConfigMock = jest.fn()

const redisRepositoryMock = {
  getAlertSnoozeConfig: getAlertSnoozeConfigMock,
  saveAlertSnoozeConfig: saveAlertSnoozeConfigMock,
}

const rescheduleAlertMock = jest.fn()
const createFollowUpAlertMock = jest.fn()
const getAlertsByUserIdMock = jest.fn()
const getAlertByIdMock = jest.fn()

const alertsServicesMock = {
  rescheduleAlert: rescheduleAlertMock,
  createFollowUpAlert: createFollowUpAlertMock,
  getAlertsByUserId: getAlertsByUserIdMock,
  getAlertById: getAlertByIdMock,
}

const ARGENTINA_TZ = 'America/Argentina/Buenos_Aires'

/** Build a Date from Argentina wall-clock parts. AR is UTC-3 year round (no DST). */
function argentinaDate(year: number, month: number, day: number, hour: number, minute = 0): Date {
  const pad = (value: number): string => String(value).padStart(2, '0')

  return new Date(`${String(year)}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:00-03:00`)
}

/** Read a Date back as Argentina wall-clock parts, so failures print a readable local time. */
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

const buildService = (): AlertInteractionsService =>
  new AlertInteractionsService(alertsServicesMock as any, redisRepositoryMock as any)

describe('AlertInteractionsService', () => {
  let service: AlertInteractionsService

  beforeEach(() => {
    jest.clearAllMocks()
    jest.useRealTimers()
    service = buildService()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  describe('snooze catalog action values (AC-12)', () => {
    // These values are already published in users' Slack message history. A drift
    // here silently breaks buttons in messages that are already sitting in Slack.
    it('produces the byte-identical legacy action values', () => {
      const findPreset = (key: string): any => snoozePresets.find((preset) => preset.key === key)

      expect(findPreset('snooze_5m').actionValue(42)).toBe('alert:snooze_5m:42')
      expect(findPreset('snooze_1h').actionValue(42)).toBe('alert:snooze_1h:42')
      expect(`alert:${SNOOZE_DEFAULT_PRESET_KEY}:42`).toBe('alert:snooze_default:42')
    })

    it('keeps every action value consistent with alert:{key}:{id}', () => {
      snoozePresets.forEach((preset) => {
        expect(preset.actionValue(7)).toBe(`alert:${preset.key}:7`)
      })
    })

    it('keeps every key parseable by the unchanged parseSlackAction regex', () => {
      // parseSlackAction lowercases the value and matches ^([a-z]+):([a-z0-9_-]+):(\d+)$
      const actionRegex = /^([a-z]+):([a-z0-9_-]+):(\d+)$/

      snoozePresets.forEach((preset) => {
        expect(actionRegex.test(preset.actionValue(1))).toBe(true)
      })
      expect(actionRegex.test(`alert:${SNOOZE_DEFAULT_PRESET_KEY}:1`)).toBe(true)
      preferencePresets.forEach((preset) => {
        expect(actionRegex.test(`assistant:${preset.key}:0`)).toBe(true)
      })
    })

    it('keeps snooze_default out of the snooze preset list', () => {
      expect(snoozePresets.map((preset) => preset.key)).toEqual([
        'snooze_5m',
        'snooze_1h',
        'snooze_tomorrow',
      ])
      expect(preferencePresets.map((preset) => preset.key)).toEqual([
        'set_snooze_5m',
        'set_snooze_10m',
        'set_snooze_30m',
      ])
    })
  })

  describe('snoozeAlert - relative presets and base rule', () => {
    it.each([
      ['snooze_5m', 5],
      ['snooze_1h', 60],
    ])(
      'reschedules %s with exactly the legacy minute amount (%i)',
      async (presetKey, expectedMinutes) => {
        // Catalog presets resolve their target against max(now, alert_date), so the
        // alert row is read first (design decision 5). The amount handed to
        // rescheduleAlert must still be the exact legacy number.
        jest.useFakeTimers().setSystemTime(argentinaDate(2026, 8, 1, 12, 0))
        getAlertByIdMock.mockResolvedValue({
          data: { id: 3, date: argentinaDate(2026, 7, 30, 8, 0) },
        })
        rescheduleAlertMock.mockResolvedValue({ data: { id: 3 } })

        const result = await service.snoozeAlert(3, 11, { presetKey, updatePreference: false })

        expect(getAlertByIdMock).toHaveBeenCalledWith(3, 11)
        expect(rescheduleAlertMock).toHaveBeenCalledWith(3, 11, expectedMinutes)
        expect(saveAlertSnoozeConfigMock).not.toHaveBeenCalled()
        expect(result).toEqual({ blocks: [] })
      }
    )

    it('reschedules a future-dated alert with the same legacy amount (base = alert_date)', async () => {
      jest.useFakeTimers().setSystemTime(argentinaDate(2026, 8, 1, 12, 0))
      getAlertByIdMock.mockResolvedValue({
        data: { id: 3, date: argentinaDate(2026, 8, 3, 18, 30) },
      })
      rescheduleAlertMock.mockResolvedValue({ data: { id: 3 } })

      await service.snoozeAlert(3, 11, { presetKey: 'snooze_5m', updatePreference: false })

      expect(rescheduleAlertMock).toHaveBeenCalledWith(3, 11, 5)
    })

    it('reschedules with an explicit minutes amount (text-command path)', async () => {
      rescheduleAlertMock.mockResolvedValue({ data: { id: 3 } })

      await service.snoozeAlert(3, 11, { minutes: 15, updatePreference: true })

      expect(rescheduleAlertMock).toHaveBeenCalledWith(3, 11, 15)
      expect(saveAlertSnoozeConfigMock).toHaveBeenCalledWith(11, { defaultSnoozeMinutes: 15 })
    })

    it('rejects a non-positive amount with the unchanged message', async () => {
      const result = await service.snoozeAlert(3, 11, { minutes: 0, updatePreference: false })

      expect(result).toBe('El snooze debe ser mayor a 1 minuto.')
      expect(rescheduleAlertMock).not.toHaveBeenCalled()
    })

    it('surfaces the reschedule error verbatim', async () => {
      rescheduleAlertMock.mockResolvedValue({ error: 'No se encontró la alerta solicitada' })

      const result = await service.snoozeAlert(3, 11, { minutes: 5, updatePreference: true })

      expect(result).toBe('No se encontró la alerta solicitada')
      expect(saveAlertSnoozeConfigMock).not.toHaveBeenCalled()
    })

    it('returns "Acción no reconocida." for an unknown preset key', async () => {
      const result = await service.snoozeAlert(3, 11, {
        presetKey: 'snooze_nope',
        updatePreference: false,
      })

      expect(result).toBe('Acción no reconocida.')
      expect(rescheduleAlertMock).not.toHaveBeenCalled()
    })

    it('applies the relative preset delta on top of max(now, alert_date) - alert in the past', () => {
      // The base rule lives in AlertsServices.rescheduleAlert and is unchanged: an
      // overdue alert snoozes from `now`, not from its own (past) date.
      const now = argentinaDate(2026, 8, 1, 12, 0)
      const alertDate = argentinaDate(2026, 7, 30, 8, 0)
      const base = alertDate > now ? alertDate : now

      expect(base).toEqual(now)

      const preset = snoozePresets.find((item) => item.key === 'snooze_5m') as any
      expect(preset.resolveTargetDate(base).getTime() - base.getTime()).toBe(5 * 60 * 1000)
    })

    it('applies the relative preset delta on top of max(now, alert_date) - alert in the future', () => {
      const now = argentinaDate(2026, 8, 1, 12, 0)
      const alertDate = argentinaDate(2026, 8, 3, 8, 0)
      const base = alertDate > now ? alertDate : now

      expect(base).toEqual(alertDate)

      const preset = snoozePresets.find((item) => item.key === 'snooze_1h') as any
      expect(argentinaWallClock(preset.resolveTargetDate(base))).toEqual({
        year: 2026,
        month: 8,
        day: 3,
        hour: 9,
        minute: 0,
      })
    })
  })

  describe('snoozeAlert - snooze_default (AC-9)', () => {
    it('reads the stored preference and does NOT write it back', async () => {
      getAlertSnoozeConfigMock.mockResolvedValue({ defaultSnoozeMinutes: 25 })
      rescheduleAlertMock.mockResolvedValue({ data: { id: 3 } })

      await service.snoozeAlert(3, 11, {
        presetKey: SNOOZE_DEFAULT_PRESET_KEY,
        updatePreference: false,
      })

      expect(getAlertSnoozeConfigMock).toHaveBeenCalledWith(11)
      expect(rescheduleAlertMock).toHaveBeenCalledWith(3, 11, 25)
      expect(saveAlertSnoozeConfigMock).not.toHaveBeenCalled()
    })

    it('falls back to 10 minutes when no preference is stored, still without writing', async () => {
      getAlertSnoozeConfigMock.mockResolvedValue(null)
      rescheduleAlertMock.mockResolvedValue({ data: { id: 3 } })

      await service.snoozeAlert(3, 11, {
        presetKey: SNOOZE_DEFAULT_PRESET_KEY,
        updatePreference: false,
      })

      expect(rescheduleAlertMock).toHaveBeenCalledWith(3, 11, 10)
      expect(saveAlertSnoozeConfigMock).not.toHaveBeenCalled()
    })

    it('resolves snooze_default without consulting the catalog or the alert row', async () => {
      getAlertSnoozeConfigMock.mockResolvedValue({ defaultSnoozeMinutes: 25 })
      rescheduleAlertMock.mockResolvedValue({ data: { id: 3 } })

      await service.snoozeAlert(3, 11, {
        presetKey: SNOOZE_DEFAULT_PRESET_KEY,
        updatePreference: false,
      })

      expect(getAlertByIdMock).not.toHaveBeenCalled()
    })
  })

  describe('snoozeAlert - tomorrow preset dispatch (AC-8)', () => {
    it('routes through resolveTargetDate to next-calendar-day 09:00 AR', async () => {
      const now = argentinaDate(2026, 8, 1, 22, 0)
      jest.useFakeTimers().setSystemTime(now)

      getAlertByIdMock.mockResolvedValue({
        data: { id: 3, date: argentinaDate(2026, 7, 30, 8, 0) },
      })
      rescheduleAlertMock.mockResolvedValue({ data: { id: 3 } })

      await service.snoozeAlert(3, 11, {
        presetKey: 'snooze_tomorrow',
        updatePreference: false,
      })

      expect(getAlertByIdMock).toHaveBeenCalledWith(3, 11)

      const minutes = rescheduleAlertMock.mock.calls[0][2]
      const resolved = new Date(now.getTime() + minutes * 60 * 1000)

      expect(argentinaWallClock(resolved)).toEqual({
        year: 2026,
        month: 8,
        day: 2,
        hour: 9,
        minute: 0,
      })
    })

    it('resolves to the NEXT day even before 09:00, never the same day', async () => {
      const now = argentinaDate(2026, 8, 1, 8, 0)
      jest.useFakeTimers().setSystemTime(now)

      getAlertByIdMock.mockResolvedValue({
        data: { id: 3, date: argentinaDate(2026, 7, 30, 8, 0) },
      })
      rescheduleAlertMock.mockResolvedValue({ data: { id: 3 } })

      await service.snoozeAlert(3, 11, {
        presetKey: 'snooze_tomorrow',
        updatePreference: false,
      })

      const minutes = rescheduleAlertMock.mock.calls[0][2]
      const resolved = new Date(now.getTime() + minutes * 60 * 1000)

      expect(argentinaWallClock(resolved)).toEqual({
        year: 2026,
        month: 8,
        day: 2,
        hour: 9,
        minute: 0,
      })
    })

    it('resolves from the alert date when the alert is in the future (base = alert_date)', async () => {
      const now = argentinaDate(2026, 8, 1, 12, 0)
      const alertDate = argentinaDate(2026, 8, 3, 18, 30)
      jest.useFakeTimers().setSystemTime(now)

      getAlertByIdMock.mockResolvedValue({ data: { id: 3, date: alertDate } })
      rescheduleAlertMock.mockResolvedValue({ data: { id: 3 } })

      await service.snoozeAlert(3, 11, {
        presetKey: 'snooze_tomorrow',
        updatePreference: false,
      })

      const minutes = rescheduleAlertMock.mock.calls[0][2]
      const resolved = new Date(alertDate.getTime() + minutes * 60 * 1000)

      expect(argentinaWallClock(resolved)).toEqual({
        year: 2026,
        month: 8,
        day: 4,
        hour: 9,
        minute: 0,
      })
    })

    it('surfaces the alert lookup error instead of rescheduling', async () => {
      getAlertByIdMock.mockResolvedValue({ error: 'No se encontró la alerta solicitada' })

      const result = await service.snoozeAlert(3, 11, {
        presetKey: 'snooze_tomorrow',
        updatePreference: false,
      })

      expect(result).toBe('No se encontró la alerta solicitada')
      expect(rescheduleAlertMock).not.toHaveBeenCalled()
    })
  })

  describe('snoozeAlert - resolveTargetDate extension (AC-B3)', () => {
    it('resolves through the caller-supplied closure, base = max(now, alert_date) - alert in the past', async () => {
      const now = argentinaDate(2026, 8, 1, 12, 0)
      jest.useFakeTimers().setSystemTime(now)

      getAlertByIdMock.mockResolvedValue({
        data: { id: 3, date: argentinaDate(2026, 7, 30, 8, 0) },
      })
      rescheduleAlertMock.mockResolvedValue({ data: { id: 3 } })

      await service.snoozeAlert(3, 11, {
        resolveTargetDate: (base) => resolveNextCalendarDayAt(base, 14, 30),
        updatePreference: false,
      })

      expect(getAlertByIdMock).toHaveBeenCalledWith(3, 11)

      const expectedTarget = resolveNextCalendarDayAt(now, 14, 30)
      const expectedMinutes = (expectedTarget.getTime() - now.getTime()) / (60 * 1000)

      expect(rescheduleAlertMock).toHaveBeenCalledWith(3, 11, expectedMinutes)
      expect(saveAlertSnoozeConfigMock).not.toHaveBeenCalled()
    })

    it('resolves from the alert date when the alert is in the future (base = alert_date)', async () => {
      const now = argentinaDate(2026, 8, 1, 12, 0)
      const alertDate = argentinaDate(2026, 8, 3, 18, 30)
      jest.useFakeTimers().setSystemTime(now)

      getAlertByIdMock.mockResolvedValue({ data: { id: 3, date: alertDate } })
      rescheduleAlertMock.mockResolvedValue({ data: { id: 3 } })

      await service.snoozeAlert(3, 11, {
        resolveTargetDate: (base) => resolveNextCalendarDayAt(base, 9, 15),
        updatePreference: false,
      })

      const expectedTarget = resolveNextCalendarDayAt(alertDate, 9, 15)
      const expectedMinutes = (expectedTarget.getTime() - alertDate.getTime()) / (60 * 1000)

      expect(rescheduleAlertMock).toHaveBeenCalledWith(3, 11, expectedMinutes)
    })

    it('bare-hour form (minute 0) resolves the same way', async () => {
      const now = argentinaDate(2026, 8, 1, 12, 0)
      jest.useFakeTimers().setSystemTime(now)

      getAlertByIdMock.mockResolvedValue({
        data: { id: 3, date: argentinaDate(2026, 7, 30, 8, 0) },
      })
      rescheduleAlertMock.mockResolvedValue({ data: { id: 3 } })

      await service.snoozeAlert(3, 11, {
        resolveTargetDate: (base) => resolveNextCalendarDayAt(base, 14, 0),
        updatePreference: false,
      })

      const expectedTarget = resolveNextCalendarDayAt(now, 14, 0)
      const expectedMinutes = (expectedTarget.getTime() - now.getTime()) / (60 * 1000)

      expect(rescheduleAlertMock).toHaveBeenCalledWith(3, 11, expectedMinutes)
    })

    it('surfaces the alert lookup error instead of rescheduling', async () => {
      getAlertByIdMock.mockResolvedValue({ error: 'No se encontró la alerta solicitada' })

      const result = await service.snoozeAlert(3, 11, {
        resolveTargetDate: (base) => resolveNextCalendarDayAt(base, 14, 30),
        updatePreference: false,
      })

      expect(result).toBe('No se encontró la alerta solicitada')
      expect(rescheduleAlertMock).not.toHaveBeenCalled()
    })

    it('does not call getAlertById-based resolution when neither minutes/presetKey/resolveTargetDate is supplied (pre-existing, untouched fallback)', async () => {
      const result = await service.snoozeAlert(3, 11, { updatePreference: false })

      expect(result).toBe('Acción no reconocida.')
      expect(rescheduleAlertMock).not.toHaveBeenCalled()
    })
  })

  describe('preference read/write', () => {
    it('getDefaultSnoozeMinutes reads the stored value', async () => {
      getAlertSnoozeConfigMock.mockResolvedValue({ defaultSnoozeMinutes: 30 })

      await expect(service.getDefaultSnoozeMinutes(11)).resolves.toBe(30)
    })

    it('getDefaultSnoozeMinutes falls back to 10', async () => {
      getAlertSnoozeConfigMock.mockResolvedValue(null)

      await expect(service.getDefaultSnoozeMinutes(11)).resolves.toBe(10)
    })

    it('setDefaultSnoozeMinutes writes the unchanged config shape', async () => {
      await service.setDefaultSnoozeMinutes(11, 30)

      expect(saveAlertSnoozeConfigMock).toHaveBeenCalledWith(11, { defaultSnoozeMinutes: 30 })
    })
  })

  describe('repeatAlert', () => {
    it('creates a daily follow-up and appends the recurrence context block', async () => {
      createFollowUpAlertMock.mockResolvedValue({ data: { id: 9 } })

      const result = (await service.repeatAlert(4, 11, 'daily')) as { blocks: any[] }

      expect(createFollowUpAlertMock).toHaveBeenCalledWith(4, 11, 24 * 60)
      expect(result.blocks[result.blocks.length - 1]).toEqual({
        type: 'context',
        elements: [{ type: 'mrkdwn', text: 'La alerta #4 se repetirá de forma diaria.' }],
      })
    })

    it('creates a weekly follow-up', async () => {
      createFollowUpAlertMock.mockResolvedValue({ data: { id: 9 } })

      const result = (await service.repeatAlert(4, 11, 'weekly')) as { blocks: any[] }

      expect(createFollowUpAlertMock).toHaveBeenCalledWith(4, 11, 7 * 24 * 60)
      expect(result.blocks[result.blocks.length - 1].elements[0].text).toBe(
        'La alerta #4 se repetirá de forma semanal.'
      )
    })

    it('surfaces the follow-up error verbatim', async () => {
      createFollowUpAlertMock.mockResolvedValue({ error: 'No se encontró la alerta base' })

      await expect(service.repeatAlert(4, 11, 'daily')).resolves.toBe(
        'No se encontró la alerta base'
      )
    })

    it('falls back to the default recurrence error message', async () => {
      createFollowUpAlertMock.mockResolvedValue({})

      await expect(service.repeatAlert(4, 11, 'daily')).resolves.toBe(
        'No se pudo crear la recurrencia. 😅'
      )
    })
  })

  describe('listAlertsByScope', () => {
    const alerts = [
      { id: 1, sent: false, date: new Date('2020-01-01T00:00:00.000Z') },
      { id: 2, sent: false, date: new Date('2999-01-01T00:00:00.000Z') },
      { id: 3, sent: true, date: new Date('2020-01-01T00:00:00.000Z') },
    ]

    it('returns the lookup error message', async () => {
      getAlertsByUserIdMock.mockResolvedValue({ error: 'boom' })

      await expect(service.listAlertsByScope(11, 'pending', null)).resolves.toBe(
        'No se pudieron obtener las alertas. 😅'
      )
    })

    it('returns the empty-store message', async () => {
      getAlertsByUserIdMock.mockResolvedValue({ data: [] })

      await expect(service.listAlertsByScope(11, 'all', null)).resolves.toBe(
        'No tienes alertas guardadas.'
      )
    })

    it('passes the channel scope through to the alerts lookup', async () => {
      getAlertsByUserIdMock.mockResolvedValue({ data: alerts })

      await service.listAlertsByScope(11, 'all', 'C123')

      expect(getAlertsByUserIdMock).toHaveBeenCalledWith(11, { channelId: 'C123' })
    })

    it.each([
      ['pending', [1, 2]],
      ['snoozed', [1, 2]],
      ['overdue', [1]],
      ['resolved', [3]],
      ['all', [1, 2, 3]],
    ])('filters the %s scope', async (scope, expectedIds) => {
      getAlertsByUserIdMock.mockResolvedValue({ data: alerts })

      await service.listAlertsByScope(11, scope as any, null)

      const passed = (slackMsgUtilsMock.msgAlertsList as jest.Mock).mock.calls[0][0]
      expect(passed.map((alert: any) => alert.id)).toEqual(expectedIds)
    })

    it('returns the scope-specific empty message', async () => {
      getAlertsByUserIdMock.mockResolvedValue({ data: [alerts[2]] })

      await expect(service.listAlertsByScope(11, 'pending', null)).resolves.toBe(
        'No tienes alertas pendientes.'
      )
    })
  })
})
