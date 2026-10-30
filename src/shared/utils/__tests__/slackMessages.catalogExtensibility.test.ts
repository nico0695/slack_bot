/**
 * AC-7 — catalog extensibility, against the REAL builders and dispatch path.
 *
 * `jest.mock` substitutes the catalog module itself, so production code runs
 * unmodified and unaware. A local fixture would pass green while the builder
 * still held hardcoded labels — the exact defect this guards against.
 *
 * Extensibility is now BOUNDED, not unlimited: since the snooze presets moved
 * into the overflow, Slack's 5-option cap leaves `SNOOZE_SLOTS` of room. The
 * mocked catalog deliberately carries one entry MORE than fits, so these tests
 * pin what happens to the surplus — it is dropped, and the emitted overflow
 * stays valid. The build-time guard against ever shipping that state lives in
 * `slackMessages.utils.test.ts`, where the catalog is the real one.
 */

import {
  msgAlertDetail,
  msgAlertsList,
  LISTING_SNOOZE_SLOTS,
  SNOOZE_SLOTS,
} from '../slackMessages.utils'
import {
  resolveSnoozeTarget,
  snoozePresets,
} from '../../../modules/alerts/shared/constants/snoozeCatalog'
import AlertInteractionsService from '../../../modules/alerts/services/alertInteractions.services'
import { Alerts } from '../../../entities/alerts'

const MINUTE_IN_MS = 60 * 1000

jest.mock('../../../modules/alerts/shared/constants/snoozeCatalog', () => {
  const actual = jest.requireActual('../../../modules/alerts/shared/constants/snoozeCatalog')

  const mockedPresets = [
    ...actual.snoozePresets,
    // The entry under test: added to the catalog and nowhere else.
    {
      key: 'snooze_3h',
      label: 'Snooze 3 horas',
      actionValue: (id: number): string => `alert:snooze_3h:${id}`,
      resolveTargetDate: ({ now, scheduledAt }: { now: Date; scheduledAt: Date }): Date =>
        new Date(Math.max(now.getTime(), scheduledAt.getTime()) + 180 * 60 * 1000),
    },
  ]

  const findSnoozePreset = (key: string): any =>
    [...mockedPresets, ...actual.hiddenSnoozePresets].find((preset) => preset.key === key)

  return {
    ...actual,
    snoozePresets: mockedPresets,
    findSnoozePreset,
    resolveSnoozeTarget: (key: string, scheduledAt: Date, now: Date): Date | null =>
      findSnoozePreset(key)?.resolveTargetDate({ now, scheduledAt }) ?? null,
  }
})

const buildAlert = (overrides: Partial<Alerts> = {}): Alerts =>
  ({
    id: 42,
    message: 'Llamar al dentista',
    date: new Date('2099-06-10T09:00:00Z'),
    sent: false,
    ...overrides,
  } as unknown as Alerts)

const getActionsBlock = (blocks: any[]): any =>
  blocks.find((block: any) => block.type === 'actions')

const getAccessory = (blocks: any[]): any =>
  blocks.find((block: any) => block.type === 'section' && block.accessory)?.accessory

const getSnoozeOptions = (accessory: any): any[] =>
  accessory.options.filter((option: any) => option.value.startsWith('alert:snooze_'))

describe('AC-7: adding a catalog preset requires no other source change', () => {
  it('confirms the mocked catalog really carries the extra entry', () => {
    expect(snoozePresets).toHaveLength(4)
    expect(snoozePresets[3].key).toBe('snooze_3h')
    // One more than the single-alert overflow can hold: that is the point.
    expect(snoozePresets.length).toBeGreaterThan(SNOOZE_SLOTS)
  })

  describe('(a) single-alert overflow is bounded by SNOOZE_SLOTS', () => {
    it('renders an option for every preset that fits, taken from the catalog', () => {
      const accessory = getAccessory(msgAlertDetail(buildAlert({ id: 8 })).blocks)
      const snoozeOptions = getSnoozeOptions(accessory)

      expect(snoozeOptions).toHaveLength(SNOOZE_SLOTS)
      expect(snoozeOptions.map((option: any) => option.value)).toEqual(
        snoozePresets.slice(0, SNOOZE_SLOTS).map((preset) => preset.actionValue(8))
      )
    })

    it('drops the surplus preset rather than emitting an overflow Slack rejects', () => {
      const accessory = getAccessory(msgAlertDetail(buildAlert({ id: 8 })).blocks)

      expect(accessory.options).toHaveLength(5)
      expect(getSnoozeOptions(accessory).map((option: any) => option.value)).not.toContain(
        'alert:snooze_3h:8'
      )
    })

    it('no longer renders a snooze actions row', () => {
      expect(getActionsBlock(msgAlertDetail(buildAlert({ id: 8 })).blocks)).toBeUndefined()
    })
  })

  describe('(b) listing render is unchanged', () => {
    it('still renders only the first LISTING_SNOOZE_SLOTS presets', () => {
      const accessory = getAccessory(msgAlertsList([buildAlert({ id: 8 })]).blocks)
      const snoozeOptions = accessory.options.filter((option: any) =>
        option.value.startsWith('alert:snooze_')
      )

      expect(snoozeOptions).toHaveLength(LISTING_SNOOZE_SLOTS)
      expect(snoozeOptions.map((option: any) => option.value)).toEqual([
        'alert:snooze_5m:8',
        'alert:snooze_1h:8',
      ])
    })

    it('keeps the listing overflow at 5 options despite the longer catalog', () => {
      const accessory = getAccessory(msgAlertsList([buildAlert({ id: 8 })]).blocks)

      expect(accessory.options).toHaveLength(5)
    })
  })

  describe('(c) the real dispatch resolves the new preset', () => {
    const snoozeAlertByPresetMock = jest.fn()
    const getAlertByIdMock = jest.fn()

    const alertsServicesMock = {
      rescheduleAlert: jest.fn(),
      snoozeAlertByPreset: snoozeAlertByPresetMock,
      createFollowUpAlert: jest.fn(),
      getAlertsByUserId: jest.fn(),
      getAlertById: getAlertByIdMock,
    }

    const redisRepositoryMock = {
      getAlertSnoozeConfig: jest.fn(),
      saveAlertSnoozeConfig: jest.fn(),
    }

    beforeEach(() => {
      jest.clearAllMocks()
    })

    it('snoozes by the new preset without any change to the service', async () => {
      const date = new Date('2099-06-10T12:00:00Z')

      getAlertByIdMock.mockResolvedValue({ data: buildAlert({ date }) })
      snoozeAlertByPresetMock.mockResolvedValue({
        status: 'snoozed',
        alertId: 8,
        scheduledAt: new Date(date.getTime() + 180 * MINUTE_IN_MS),
      })

      const service = new AlertInteractionsService(
        alertsServicesMock as any,
        redisRepositoryMock as any
      )

      const result = await service.snoozeAlert(8, 11, {
        presetKey: 'snooze_3h',
        updatePreference: false,
      })

      // A preset the service does not recognise returns this string instead of
      // rescheduling, so asserting its absence proves the dispatch resolved.
      expect(result).not.toBe('Acción no reconocida.')
      expect(snoozeAlertByPresetMock).toHaveBeenCalledWith(8, 11, 'snooze_3h', date)
      expect(resolveSnoozeTarget('snooze_3h', date, date)).toEqual(
        new Date(date.getTime() + 180 * MINUTE_IN_MS)
      )
      expect(redisRepositoryMock.saveAlertSnoozeConfig).not.toHaveBeenCalled()
    })
  })
})
