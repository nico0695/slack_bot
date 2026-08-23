import {
  msgRemindersList,
  msgReminderDetail,
  msgReminderCreated,
  msgAssistantQuickHelp,
  msgAlertCreated,
  msgAlertDetail,
  msgAlertsList,
  msgAssistantDigest,
  LISTING_SNOOZE_SLOTS,
  SNOOZE_SLOTS,
  OVERFLOW_MAX_OPTIONS,
} from '../slackMessages.utils'
import { Reminders } from '../../../entities/reminders'
import {
  ReminderRecurrenceType,
  ReminderStatus,
} from '../../../modules/reminders/shared/constants/reminders.constants'
import {
  preferencePresets,
  snoozePresets,
} from '../../../modules/alerts/shared/constants/snoozeCatalog'
import { Alerts } from '../../../entities/alerts'
import { readFileSync } from 'fs'
import { join } from 'path'

const buildReminder = (overrides: Partial<Reminders> = {}): Reminders =>
  ({
    id: 12,
    message: 'Daily standup',
    recurrenceType: ReminderRecurrenceType.DAILY,
    timeOfDay: '09:00',
    weekDays: null,
    monthDays: null,
    status: ReminderStatus.ACTIVE,
    nextTriggerAt: new Date('2026-06-10T09:00:00Z'),
    lastTriggeredAt: null,
    channelId: null,
    ...overrides,
  } as unknown as Reminders)

const getOptionValues = (accessory: any): string[] =>
  accessory.options.map((option: any) => option.value)

const getOptionLabels = (accessory: any): string[] =>
  accessory.options.map((option: any) => option.text.text)

describe('reminderOverflowAccessory (via reminder message builders)', () => {
  describe('AC-1: builder shape and status exclusivity', () => {
    it('returns an overflow block with action_id and ordered option values for an active reminder', () => {
      const reminder = buildReminder({ status: ReminderStatus.ACTIVE })

      const accessory = msgReminderDetail(reminder).blocks[0].accessory

      expect(accessory.type).toBe('overflow')
      expect(accessory.action_id).toBe('reminder_actions:12')
      expect(getOptionValues(accessory)).toEqual([
        'reminder:detail:12',
        'reminder:check:12',
        'reminder:pause:12',
        'reminder:delete:12',
      ])
    })

    it('shows resume instead of pause for a paused reminder', () => {
      const reminder = buildReminder({ status: ReminderStatus.PAUSED })

      const accessory = msgReminderDetail(reminder).blocks[0].accessory

      expect(accessory.action_id).toBe('reminder_actions:12')
      expect(getOptionValues(accessory)).toEqual([
        'reminder:detail:12',
        'reminder:check:12',
        'reminder:resume:12',
        'reminder:delete:12',
      ])
    })

    it('never includes pause and resume at the same time', () => {
      const activeValues = getOptionValues(
        msgReminderDetail(buildReminder({ status: ReminderStatus.ACTIVE })).blocks[0].accessory
      )
      const pausedValues = getOptionValues(
        msgReminderDetail(buildReminder({ status: ReminderStatus.PAUSED })).blocks[0].accessory
      )

      expect(activeValues).toContain('reminder:pause:12')
      expect(activeValues).not.toContain('reminder:resume:12')
      expect(pausedValues).toContain('reminder:resume:12')
      expect(pausedValues).not.toContain('reminder:pause:12')
    })

    it('uses the reminder id in action_id and option values', () => {
      const reminder = buildReminder({ id: 7 })

      const accessory = msgReminderDetail(reminder).blocks[0].accessory

      expect(accessory.action_id).toBe('reminder_actions:7')
      expect(getOptionValues(accessory)).toEqual([
        'reminder:detail:7',
        'reminder:check:7',
        'reminder:pause:7',
        'reminder:delete:7',
      ])
    })
  })

  describe('AC-2: accessory attached to reminder messages', () => {
    it('attaches the accessory to each reminder row section in msgRemindersList', () => {
      const reminders = [
        buildReminder({ id: 1, status: ReminderStatus.ACTIVE }),
        buildReminder({ id: 2, status: ReminderStatus.PAUSED }),
      ]

      const { blocks } = msgRemindersList(reminders)
      const rowSections = blocks.filter((block: any) => block.type === 'section' && block.accessory)

      expect(rowSections).toHaveLength(2)
      expect(rowSections[0].accessory.action_id).toBe('reminder_actions:1')
      expect(getOptionValues(rowSections[0].accessory)).toContain('reminder:pause:1')
      expect(rowSections[1].accessory.action_id).toBe('reminder_actions:2')
      expect(getOptionValues(rowSections[1].accessory)).toContain('reminder:resume:2')
    })

    it('attaches the accessory to the section in msgReminderDetail', () => {
      const { blocks } = msgReminderDetail(buildReminder())

      expect(blocks[0].type).toBe('section')
      expect(blocks[0].accessory.type).toBe('overflow')
      expect(blocks[0].accessory.action_id).toBe('reminder_actions:12')
    })

    it('attaches the accessory to the section in msgReminderCreated', () => {
      const { blocks } = msgReminderCreated(buildReminder())

      expect(blocks[0].type).toBe('section')
      expect(blocks[0].accessory.type).toBe('overflow')
      expect(blocks[0].accessory.action_id).toBe('reminder_actions:12')
    })
  })

  describe('AC-7: Spanish option labels', () => {
    it('uses the final Spanish labels for an active reminder', () => {
      const accessory = msgReminderDetail(buildReminder({ status: ReminderStatus.ACTIVE }))
        .blocks[0].accessory

      expect(getOptionLabels(accessory)).toEqual([
        'Ver Detalles',
        'Marcar hecho hoy',
        'Pausar',
        'Eliminar',
      ])
    })

    it('uses "Reanudar" for a paused reminder', () => {
      const accessory = msgReminderDetail(buildReminder({ status: ReminderStatus.PAUSED }))
        .blocks[0].accessory

      expect(getOptionLabels(accessory)).toEqual([
        'Ver Detalles',
        'Marcar hecho hoy',
        'Reanudar',
        'Eliminar',
      ])
    })

    it('renders option labels as plain_text', () => {
      const accessory = msgReminderDetail(buildReminder()).blocks[0].accessory

      accessory.options.forEach((option: any) => {
        expect(option.text.type).toBe('plain_text')
      })
    })
  })
})

describe('msgAssistantQuickHelp preference buttons (S6)', () => {
  const buildQuickHelpPayload = (): any => ({
    alerts: 3,
    alertsPending: 2,
    alertsOverdue: 1,
    alertsResolved: 0,
    alertsSnoozed: 0,
    notes: 1,
    tasks: 1,
    tasksPending: 1,
  })

  const getActionElements = (): any[] => {
    const { blocks } = msgAssistantQuickHelp(buildQuickHelpPayload())
    const actionsBlock = blocks.find((block: any) => block.type === 'actions')

    return actionsBlock.elements
  }

  describe('catalog-driven generation', () => {
    it('renders exactly one button per preference preset', () => {
      expect(getActionElements()).toHaveLength(preferencePresets.length)
    })

    it('derives every action_id, value and label from the catalog entry', () => {
      const elements = getActionElements()

      preferencePresets.forEach((preset, index) => {
        expect(elements[index]).toEqual({
          type: 'button',
          action_id: `assistant_actions:${preset.key}:0`,
          text: { type: 'plain_text', text: `Snooze ${preset.minutes}m` },
          value: `assistant:${preset.key}:0`,
        })
      })
    })
  })

  describe('load-bearing wire formats (AC-1, AC-2, AC-11)', () => {
    it('keeps the assistant_actions action_id prefix the app.ts regex matches', () => {
      const actionIds = getActionElements().map((element) => element.action_id)

      expect(actionIds).toEqual([
        'assistant_actions:set_snooze_5m:0',
        'assistant_actions:set_snooze_10m:0',
        'assistant_actions:set_snooze_30m:0',
      ])
    })

    it('keeps the assistant: value format parseSlackAction resolves to entity "assistant"', () => {
      const values = getActionElements().map((element) => element.value)

      expect(values).toEqual([
        'assistant:set_snooze_5m:0',
        'assistant:set_snooze_10m:0',
        'assistant:set_snooze_30m:0',
      ])
    })

    it('keeps the rendered Spanish button labels byte-identical to the legacy panel', () => {
      const labels = getActionElements().map((element) => element.text.text)

      expect(labels).toEqual(['Snooze 5m', 'Snooze 10m', 'Snooze 30m'])
    })
  })
})

const buildAlert = (overrides: Partial<Alerts> = {}): Alerts =>
  ({
    id: 42,
    message: 'Llamar al dentista',
    date: new Date('2099-06-10T09:00:00Z'),
    sent: false,
    ...overrides,
  } as unknown as Alerts)

const getAccessory = (blocks: any[]): any =>
  blocks.find((block: any) => block.type === 'section' && block.accessory)?.accessory

const getActionsBlock = (blocks: any[]): any =>
  blocks.find((block: any) => block.type === 'actions')

/** Snooze options only, so a surface's fixed options do not shift the indexes. */
const getSnoozeOptions = (accessory: any): any[] =>
  accessory.options.filter((option: any) => option.value.startsWith('alert:snooze_'))

/** Every `overflow` element anywhere in a block list, however it is nested. */
const collectOverflows = (blocks: any[]): any[] => {
  const found: any[] = []

  const visit = (node: any): void => {
    if (!node || typeof node !== 'object') return

    if (Array.isArray(node)) {
      node.forEach(visit)
      return
    }

    if (node.type === 'overflow') found.push(node)
    if (node.accessory) visit(node.accessory)
    if (node.elements) visit(node.elements)
  }

  visit(blocks)

  return found
}

describe('alert snooze render paths (S6)', () => {
  describe('AC-6a: single-alert surfaces carry the catalog inside the overflow', () => {
    // msgAlertDetail is also the cron notification (cronJob.ts:36).
    const singleAlertSurfaces: Array<[string, (alert: Alerts) => { blocks: any[] }]> = [
      ['msgAlertCreated', msgAlertCreated],
      ['msgAlertDetail (also the cron notification)', msgAlertDetail],
    ]

    singleAlertSurfaces.forEach(([name, build]) => {
      describe(name, () => {
        it('renders exactly one option per snooze preset', () => {
          const accessory = getAccessory(build(buildAlert()).blocks)

          expect(accessory.type).toBe('overflow')
          expect(getSnoozeOptions(accessory)).toHaveLength(snoozePresets.length)
        })

        it('derives every option label and value from the catalog entry', () => {
          const accessory = getAccessory(build(buildAlert({ id: 7 })).blocks)
          const snoozeOptions = getSnoozeOptions(accessory)

          snoozePresets.forEach((preset, index) => {
            expect(snoozeOptions[index]).toEqual({
              text: { type: 'plain_text', text: preset.label },
              value: preset.actionValue(7),
            })
          })
        })

        it('keeps the action_id prefix the app.ts action regex matches', () => {
          const accessory = getAccessory(build(buildAlert({ id: 7 })).blocks)

          expect(accessory.action_id).toBe('alert_actions:7')
        })

        it('drops the redundant "Ver Detalles" option: the message already IS the detail', () => {
          const accessory = getAccessory(build(buildAlert()).blocks)

          expect(getOptionLabels(accessory)).toEqual([
            'Snooze 5 min',
            'Snooze 1 hora',
            'Mañana 9:00',
            'Marcar resuelta',
            'Eliminar',
          ])
          expect(getOptionValues(accessory)).toEqual([
            'alert:snooze_5m:42',
            'alert:snooze_1h:42',
            'alert:snooze_tomorrow:42',
            'alert:resolve:42',
            'alert:delete:42',
          ])
        })

        it('no longer attaches a snooze actions row', () => {
          expect(getActionsBlock(build(buildAlert()).blocks)).toBeUndefined()
        })
      })
    })
  })

  describe('AC-6b: listing rows render a bounded, catalog-driven overflow', () => {
    it('renders exactly the first LISTING_SNOOZE_SLOTS presets', () => {
      const accessory = getAccessory(msgAlertsList([buildAlert({ id: 3 })]).blocks)
      const expectedSnooze = snoozePresets.slice(0, LISTING_SNOOZE_SLOTS)

      const snoozeOptions = accessory.options.filter((option: any) =>
        option.value.startsWith('alert:snooze_')
      )

      expect(snoozeOptions).toHaveLength(expectedSnooze.length)
      expect(snoozeOptions).toEqual(
        expectedSnooze.map((preset) => ({
          text: { type: 'plain_text', text: preset.label },
          value: preset.actionValue(3),
        }))
      )
    })

    it('exposes LISTING_SNOOZE_SLOTS as a named export, not an inline literal', () => {
      expect(typeof LISTING_SNOOZE_SLOTS).toBe('number')
      expect(LISTING_SNOOZE_SLOTS).toBe(2)

      const source = readFileSync(join(__dirname, '..', 'slackMessages.utils.ts'), 'utf-8')

      // The bound must be applied through the named constant. A bare
      // `slice(0, 2)` would satisfy the assertion above while silently
      // truncating with no stated reason, which is what AC-6b forbids.
      expect(source).toContain('snoozePresets.slice(0, LISTING_SNOOZE_SLOTS)')
      expect(source).not.toMatch(/snoozePresets\.slice\(\s*0\s*,\s*\d/)
      expect(source).toMatch(/export const LISTING_SNOOZE_SLOTS = 2/)
    })

    it('keeps the listing overflow byte-identical to the pre-catalog output', () => {
      const accessory = getAccessory(msgAlertsList([buildAlert({ id: 3 })]).blocks)

      expect(getOptionLabels(accessory)).toEqual([
        'Ver Detalles',
        'Snooze 5 min',
        'Snooze 1 hora',
        'Marcar resuelta',
        'Eliminar',
      ])
      expect(getOptionValues(accessory)).toEqual([
        'alert:detail:3',
        'alert:snooze_5m:3',
        'alert:snooze_1h:3',
        'alert:resolve:3',
        'alert:delete:3',
      ])
    })

    it('does not attach a snooze actions row to listing rows', () => {
      const { blocks } = msgAlertsList([buildAlert(), buildAlert({ id: 43 })])

      expect(getActionsBlock(blocks)).toBeUndefined()
    })
  })

  describe('AC-12: legacy action values survive the container change', () => {
    it('emits alert:snooze_5m and alert:snooze_1h byte-identically on both paths', () => {
      const listing = getAccessory(msgAlertsList([buildAlert({ id: 99 })]).blocks)
      const single = getAccessory(msgAlertDetail(buildAlert({ id: 99 })).blocks)

      expect(getOptionValues(listing)).toContain('alert:snooze_5m:99')
      expect(getOptionValues(listing)).toContain('alert:snooze_1h:99')

      expect(getOptionValues(single)).toContain('alert:snooze_5m:99')
      expect(getOptionValues(single)).toContain('alert:snooze_1h:99')
    })
  })

  describe('AC-7 guard: the catalog must stay within what a surface can render', () => {
    /**
     * Slack rejects the ENTIRE message when an overflow exceeds its cap, so the
     * builder slices. That slice is silent by construction: without this test a
     * fourth preset would ship, resolve fine by text command, and simply never
     * appear in Slack. Fail the build instead.
     */
    it('keeps snoozePresets within SNOOZE_SLOTS', () => {
      expect(snoozePresets.length).toBeLessThanOrEqual(SNOOZE_SLOTS)
    })

    it('derives SNOOZE_SLOTS from Slack’s cap minus the fixed options', () => {
      expect(OVERFLOW_MAX_OPTIONS).toBe(5)
      // `Marcar resuelta` + `Eliminar` are the two fixed options.
      expect(SNOOZE_SLOTS).toBe(OVERFLOW_MAX_OPTIONS - 2)
      expect(LISTING_SNOOZE_SLOTS).toBe(SNOOZE_SLOTS - 1)
    })
  })

  describe('AC-17: no alert surface may exceed Slack’s 5-option overflow cap', () => {
    const digestPayload = (alerts: Alerts[]): any => ({
      title: 'Resumen',
      rangeLabel: 'hoy',
      stats: {
        alertsPending: alerts.length,
        alertsOverdue: 0,
        alertsResolved: 0,
        tasksPending: 0,
        tasksCompleted: 0,
        notes: 0,
      },
      highlights: { alerts, tasks: [], notes: [] },
    })

    const allSurfaces: Array<[string, () => { blocks: any[] }]> = [
      ['msgAlertCreated', () => msgAlertCreated(buildAlert())],
      ['msgAlertDetail (cron notification)', () => msgAlertDetail(buildAlert())],
      [
        'msgAlertsList',
        () => msgAlertsList([buildAlert(), buildAlert({ id: 43 }), buildAlert({ id: 44 })]),
      ],
      ['msgAssistantDigest', () => msgAssistantDigest(digestPayload([buildAlert()]))],
    ]

    allSurfaces.forEach(([name, build]) => {
      it(`keeps every overflow at or under 5 options on ${name}`, () => {
        const overflows = collectOverflows(build().blocks)

        expect(overflows.length).toBeGreaterThan(0)
        overflows.forEach((overflow: any) => {
          expect(overflow.options.length).toBeLessThanOrEqual(5)
        })
      })
    })
  })
})
