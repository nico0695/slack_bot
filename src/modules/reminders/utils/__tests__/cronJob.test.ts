import { ReminderStatus } from '../../shared/constants/reminders.constants'
import { reminderCronJob } from '../cronJob'

const mockReminderFns = {
  getDueReminders: jest.fn(),
  refreshReminderSchedule: jest.fn(),
  processReminderTrigger: jest.fn(),
}

const getReminderCheckByOccurrenceMock = jest.fn()
const postMessageMock = jest.fn()
const resolveMock = jest.fn()

jest.mock('../../services/reminders.services', () => ({
  __esModule: true,
  default: class MockRemindersServices {},
}))

jest.mock('../../repositories/database/reminderChecks.dataSource', () => ({
  __esModule: true,
  default: class MockReminderChecksDataSource {},
}))

jest.mock('tsyringe', () => ({
  container: {
    resolve: (...args: any[]) => resolveMock(...args),
  },
  singleton: () => (cls: any) => cls,
}))

jest.mock('../../../../config/slackConfig', () => ({
  connectionSlackApp: {
    client: {
      chat: {
        postMessage: (...args: any[]) => postMessageMock(...args),
      },
    },
  },
}))

jest.mock('../../../../config/logger', () => ({
  createModuleLogger: jest.fn().mockReturnValue({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    fatal: jest.fn(),
  }),
}))

describe('reminderCronJob', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    resolveMock.mockImplementation((token: any) => {
      if (token.name === 'MockReminderChecksDataSource') {
        return {
          getReminderCheckByOccurrence: (...args: any[]) =>
            getReminderCheckByOccurrenceMock(...args),
        }
      }

      return {
        getDueReminders: (...args: any[]) => mockReminderFns.getDueReminders(...args),
        refreshReminderSchedule: (...args: any[]) =>
          mockReminderFns.refreshReminderSchedule(...args),
        processReminderTrigger: (...args: any[]) => mockReminderFns.processReminderTrigger(...args),
      }
    })
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('returns early when due reminders lookup fails', async () => {
    mockReminderFns.getDueReminders.mockResolvedValue({ error: 'fail' })

    await reminderCronJob()

    expect(postMessageMock).not.toHaveBeenCalled()
    expect(mockReminderFns.processReminderTrigger).not.toHaveBeenCalled()
  })

  it('skips processing when there are no due reminders', async () => {
    mockReminderFns.getDueReminders.mockResolvedValue({ data: [] })

    await reminderCronJob()

    expect(postMessageMock).not.toHaveBeenCalled()
  })

  it('sends slack notification and advances next trigger when reminder is unchecked', async () => {
    const now = new Date(2026, 2, 29, 10, 0, 0, 0)
    jest.useFakeTimers().setSystemTime(now)

    const reminder = {
      id: 1,
      message: 'Drink water',
      status: ReminderStatus.ACTIVE,
      timeOfDay: '09:00',
      channelId: null,
      user: { slackChannelId: 'U123' },
    }

    mockReminderFns.getDueReminders.mockResolvedValue({ data: [reminder] })
    getReminderCheckByOccurrenceMock.mockResolvedValue(null)
    mockReminderFns.processReminderTrigger.mockResolvedValue({ data: { reminderId: 1 } })

    await reminderCronJob()

    expect(getReminderCheckByOccurrenceMock).toHaveBeenCalledWith(1, '2026-03-29')
    expect(postMessageMock).toHaveBeenCalledWith({
      channel: 'U123',
      text: 'Reminder: Drink water',
    })
    expect(mockReminderFns.processReminderTrigger).toHaveBeenCalledWith(1, now)
  })

  it('skips notification when reminder occurrence is already checked', async () => {
    const now = new Date(2026, 2, 29, 10, 0, 0, 0)
    jest.useFakeTimers().setSystemTime(now)

    const reminder = {
      id: 2,
      message: 'Standup',
      status: ReminderStatus.ACTIVE,
      timeOfDay: '09:00',
      channelId: 'C123',
      user: { slackChannelId: 'U123' },
    }

    mockReminderFns.getDueReminders.mockResolvedValue({ data: [reminder] })
    getReminderCheckByOccurrenceMock.mockResolvedValue({ id: 44 })
    mockReminderFns.processReminderTrigger.mockResolvedValue({ data: { reminderId: 2 } })

    await reminderCronJob()

    expect(postMessageMock).not.toHaveBeenCalled()
    expect(mockReminderFns.processReminderTrigger).toHaveBeenCalledWith(2, now)
  })

  it('recomputes next trigger without notifying when backlog is stale but before today schedule', async () => {
    const now = new Date(2026, 2, 29, 8, 0, 0, 0)
    jest.useFakeTimers().setSystemTime(now)

    const reminder = {
      id: 3,
      message: 'Take medicine',
      status: ReminderStatus.ACTIVE,
      timeOfDay: '09:00',
      channelId: null,
      user: { slackChannelId: 'U123' },
    }

    mockReminderFns.getDueReminders.mockResolvedValue({ data: [reminder] })
    mockReminderFns.refreshReminderSchedule.mockResolvedValue({ data: { id: 3 } })

    await reminderCronJob()

    expect(getReminderCheckByOccurrenceMock).not.toHaveBeenCalled()
    expect(postMessageMock).not.toHaveBeenCalled()
    expect(mockReminderFns.refreshReminderSchedule).toHaveBeenCalledWith(3, now)
    expect(mockReminderFns.processReminderTrigger).not.toHaveBeenCalled()
  })

  it('does not process paused reminders even if datasource returns them', async () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 2, 29, 10, 0, 0, 0))

    mockReminderFns.getDueReminders.mockResolvedValue({
      data: [
        {
          id: 4,
          message: 'Paused reminder',
          status: ReminderStatus.PAUSED,
          timeOfDay: '09:00',
          channelId: null,
          user: { slackChannelId: 'U123' },
        },
      ],
    })

    await reminderCronJob()

    expect(getReminderCheckByOccurrenceMock).not.toHaveBeenCalled()
    expect(postMessageMock).not.toHaveBeenCalled()
    expect(mockReminderFns.processReminderTrigger).not.toHaveBeenCalled()
  })
})
