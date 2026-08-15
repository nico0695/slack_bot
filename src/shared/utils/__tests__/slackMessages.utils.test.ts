import { msgRemindersList, msgReminderDetail, msgReminderCreated } from '../slackMessages.utils'
import { Reminders } from '../../../entities/reminders'
import {
  ReminderRecurrenceType,
  ReminderStatus,
} from '../../../modules/reminders/shared/constants/reminders.constants'

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
