import MessageProcessor from '../messageProcessor.service'
import AlertInteractionsService from '../../../alerts/services/alertInteractions.services'
import {
  ReminderRecurrenceType,
  ReminderScope,
  ReminderStatus,
  ReminderWeekDay,
} from '../../../reminders/shared/constants/reminders.constants'

const redisRepositoryMock = {
  getAlertSnoozeConfig: jest.fn(),
  saveAlertSnoozeConfig: jest.fn(),
}

const aiRepositoryMock = {
  chatCompletion: jest.fn(),
}

const alertsServicesMock = {
  getAlertsByUserId: jest.fn(),
  createAssistantAlert: jest.fn(),
  rescheduleAlert: jest.fn(),
  createFollowUpAlert: jest.fn(),
  getAlertById: jest.fn(),
}

// The five alert-interaction operations now live in AlertInteractionsService;
// MessageProcessor only parses the text command and delegates to it. This mock is
// used only by the delegation describe block, which asserts argument forwarding.
// Every other describe keeps a REAL AlertInteractionsService (see buildProcessor)
// so that the pre-existing assertions against alertsServicesMock/redisRepositoryMock
// still observe the same boundary calls they observed before the rewire.
const alertInteractionsServiceMock = {
  snoozeAlert: jest.fn(),
  repeatAlert: jest.fn(),
  listAlertsByScope: jest.fn(),
  getDefaultSnoozeMinutes: jest.fn(),
  setDefaultSnoozeMinutes: jest.fn(),
}

const tasksServicesMock = {
  getTasksByUserId: jest.fn(),
  createAssistantTask: jest.fn(),
}

const notesServicesMock = {
  getNotesByUserId: jest.fn(),
  createAssistantNote: jest.fn(),
}

const linksServicesMock = {
  getLinksByUserId: jest.fn(),
  createAssistantLink: jest.fn(),
}

const remindersServicesMock = {
  createReminder: jest.fn(),
  getRemindersByScope: jest.fn(),
  getReminderById: jest.fn(),
  pauseReminder: jest.fn(),
  resumeReminder: jest.fn(),
  deleteReminder: jest.fn(),
  checkReminderOccurrence: jest.fn(),
}

const imagesServicesMock = {
  getImages: jest.fn(),
  generateImageForAssistant: jest.fn(),
}

const searchRepositoryMock = {
  search: jest.fn(),
}

const translateServicesMock = {
  translate: jest.fn(),
}

const qrServicesMock = {
  generateQr: jest.fn(),
}

const buildBlocksMock = (): { blocks: any[] } => ({ blocks: [] as any[] })

jest.mock('../../../../shared/utils/slackMessages.utils', () => ({
  msgAlertsList: jest.fn(() => buildBlocksMock()),
  msgAlertCreated: jest.fn(() => buildBlocksMock()),
  msgAlertDetail: jest.fn(() => buildBlocksMock()),
  msgTasksList: jest.fn(() => buildBlocksMock()),
  msgTaskCreated: jest.fn(() => buildBlocksMock()),
  msgNotesList: jest.fn(() => buildBlocksMock()),
  msgNoteCreated: jest.fn(() => buildBlocksMock()),
  msgLinksList: jest.fn(() => buildBlocksMock()),
  msgLinkCreated: jest.fn(() => buildBlocksMock()),
  msgReminderCreated: jest.fn(() => buildBlocksMock()),
  msgRemindersList: jest.fn(() => buildBlocksMock()),
  msgReminderDetail: jest.fn(() => buildBlocksMock()),
}))

jest.mock('../../../../config/slackConfig', () => ({
  connectionSlackApp: {
    client: {
      chat: {
        postMessage: jest.fn(),
      },
    },
  },
}))

/**
 * A real AlertInteractionsService wired over the SAME `alertsServicesMock` /
 * `redisRepositoryMock` stubs this file already used. The delegation hop is new;
 * the boundary the pre-existing assertions watch is not, so none of them changed.
 */
const buildRealAlertInteractions = (): AlertInteractionsService =>
  new AlertInteractionsService(alertsServicesMock as any, redisRepositoryMock as any)

const buildProcessor = (
  alertInteractionsService: any = buildRealAlertInteractions()
): MessageProcessor =>
  new MessageProcessor(
    aiRepositoryMock as any,
    redisRepositoryMock as any,
    alertsServicesMock as any,
    alertInteractionsService,
    tasksServicesMock as any,
    notesServicesMock as any,
    linksServicesMock as any,
    remindersServicesMock as any,
    imagesServicesMock as any,
    searchRepositoryMock as any,
    translateServicesMock as any,
    qrServicesMock as any
  )

describe('MessageProcessor - channel scoped lookups', () => {
  let processor: MessageProcessor

  beforeEach(() => {
    jest.clearAllMocks()
    redisRepositoryMock.getAlertSnoozeConfig.mockResolvedValue({ defaultSnoozeMinutes: 10 })
    processor = buildProcessor()
  })

  it('requests channel-specific alerts when running inside a channel', async () => {
    alertsServicesMock.getAlertsByUserId.mockResolvedValue({
      data: [
        {
          id: 1,
          sent: false,
          date: new Date(),
          message: 'Demo',
        },
      ],
    })

    const result = await processor.processAssistantMessage('alerts pending', 99, 'C12345', true)

    expect(alertsServicesMock.getAlertsByUserId).toHaveBeenCalledWith(99, {
      channelId: 'C12345',
    })
    expect(result.response).toBeTruthy()
  })

  it('defaults to personal scope when context is not a channel', async () => {
    alertsServicesMock.getAlertsByUserId.mockResolvedValue({
      data: [],
    })

    const result = await processor.processAssistantMessage('alerts pending', 77, 'D123', false)

    expect(alertsServicesMock.getAlertsByUserId).toHaveBeenCalledWith(77, {
      channelId: null,
    })
    expect(result.response).toBeTruthy()
  })
})

describe('MessageProcessor - image handling', () => {
  let processor: MessageProcessor

  beforeEach(() => {
    jest.clearAllMocks()
    redisRepositoryMock.getAlertSnoozeConfig.mockResolvedValue({ defaultSnoozeMinutes: 10 })
    processor = buildProcessor()
  })

  it('lists images when using .img -l variable', async () => {
    imagesServicesMock.getImages.mockResolvedValue({
      data: {
        data: [
          { imageUrl: 'https://example.com/img1.png', prompt: 'A cat', provider: 'openai' },
          { imageUrl: 'https://example.com/img2.png', prompt: 'A dog', provider: 'openai' },
        ],
      },
    })

    const result = await processor.processAssistantMessage('.img -l', 99, undefined, false)

    expect(imagesServicesMock.getImages).toHaveBeenCalledWith(1, 10)
    expect(result.response).toBeTruthy()
    expect(result.response?.content).toContain('Tus imágenes recientes')
  })

  it('returns empty message when no images exist', async () => {
    imagesServicesMock.getImages.mockResolvedValue({
      data: { data: [] },
    })

    const result = await processor.processAssistantMessage('.img -l', 99, undefined, false)

    expect(result.response?.content).toBe('No tienes imágenes generadas')
  })

  it('generates image when using .img variable with prompt', async () => {
    imagesServicesMock.generateImageForAssistant.mockResolvedValue({
      images: [{ url: 'https://example.com/generated.png', id: '1', createdAt: new Date() }],
      provider: 'openai',
    })

    const result = await processor.processAssistantMessage(
      '.img a beautiful sunset',
      99,
      undefined,
      false
    )

    expect(imagesServicesMock.generateImageForAssistant).toHaveBeenCalledWith(
      'a beautiful sunset',
      99,
      {}
    )
    expect(result.response).toBeTruthy()
    expect(result.response?.content).toContain('Generated')
    expect(result.response?.content).toContain('openai')
  })

  it('parses image options from flags', async () => {
    imagesServicesMock.generateImageForAssistant.mockResolvedValue({
      images: [{ url: 'https://example.com/generated.png', id: '1', createdAt: new Date() }],
      provider: 'openai',
    })

    // Note: -s is shorthand for -size, -qty for -quality, -num for -number
    const result = await processor.processAssistantMessage(
      '.img a cat -size 1536x1024 -quality high -num 2',
      99,
      undefined,
      false
    )

    expect(imagesServicesMock.generateImageForAssistant).toHaveBeenCalledWith('a cat', 99, {
      size: '1536x1024',
      quality: 'high',
      numberOfImages: 2,
    })
    expect(result.response).toBeTruthy()
  })

  it('handles image generation errors gracefully', async () => {
    imagesServicesMock.generateImageForAssistant.mockRejectedValue(
      new Error('API rate limit exceeded')
    )

    const result = await processor.processAssistantMessage(
      '.img a beautiful sunset',
      99,
      undefined,
      false
    )

    expect(result.response?.content).toContain('API rate limit exceeded')
  })
})

describe('MessageProcessor - skip AI flag', () => {
  let processor: MessageProcessor

  beforeEach(() => {
    jest.clearAllMocks()
    processor = buildProcessor()
  })

  it('returns shouldSkipAI true when message starts with +', async () => {
    const result = await processor.processAssistantMessage('+ some message', 99, undefined, false)

    expect(result.shouldSkipAI).toBe(true)
    expect(result.response).toBeNull()
  })

  it('cleanSkipFlag removes the + prefix', () => {
    expect(processor.cleanSkipFlag('+ some message')).toBe('some message')
    expect(processor.cleanSkipFlag('+message')).toBe('message')
  })
})

describe('MessageProcessor - link handling', () => {
  let processor: MessageProcessor

  beforeEach(() => {
    jest.clearAllMocks()
    redisRepositoryMock.getAlertSnoozeConfig.mockResolvedValue({ defaultSnoozeMinutes: 10 })
    processor = buildProcessor()
  })

  it('creates a link with .link <url>', async () => {
    linksServicesMock.createAssistantLink.mockResolvedValue({
      data: { id: 1, url: 'https://example.com', title: '', tag: '', description: '' },
    })

    const result = await processor.processAssistantMessage(
      '.link https://example.com',
      99,
      undefined,
      false
    )

    expect(linksServicesMock.createAssistantLink).toHaveBeenCalledWith(
      99,
      'https://example.com',
      expect.objectContaining({ title: '', description: '' })
    )
    expect(result.response).toBeTruthy()
    expect(result.response?.content).toContain('#1')
  })

  it('creates a link with flags -tt -d -t', async () => {
    linksServicesMock.createAssistantLink.mockResolvedValue({
      data: {
        id: 2,
        url: 'https://example.com',
        title: 'My Title',
        tag: 'dev',
        description: 'Desc',
      },
    })

    const result = await processor.processAssistantMessage(
      '.link https://example.com -tt My Title -d Desc -t dev',
      99,
      undefined,
      false
    )

    expect(linksServicesMock.createAssistantLink).toHaveBeenCalledWith(
      99,
      'https://example.com',
      expect.objectContaining({ title: 'My Title', description: 'Desc', tag: 'dev' })
    )
    expect(result.response).toBeTruthy()
  })

  it('lists links with .link -l', async () => {
    linksServicesMock.getLinksByUserId.mockResolvedValue({
      data: [{ id: 1, url: 'https://example.com', title: 'Test', tag: '', status: 'unread' }],
    })

    const result = await processor.processAssistantMessage('.link -l', 99, undefined, false)

    expect(linksServicesMock.getLinksByUserId).toHaveBeenCalledWith(99, { channelId: null })
    expect(result.response).toBeTruthy()
  })

  it('lists links by tag with .link -lt dev', async () => {
    linksServicesMock.getLinksByUserId.mockResolvedValue({
      data: [{ id: 1, url: 'https://example.com', title: 'Test', tag: 'dev', status: 'unread' }],
    })

    const result = await processor.processAssistantMessage('.link -lt dev', 99, undefined, false)

    expect(linksServicesMock.getLinksByUserId).toHaveBeenCalledWith(99, {
      tag: 'dev',
      channelId: null,
    })
    expect(result.response).toBeTruthy()
    expect(result.response?.content).toContain('dev')
  })

  it('throws when URL is missing in .link', async () => {
    await expect(processor.processAssistantMessage('.link', 99, undefined, false)).rejects.toThrow(
      'debes ingresar una URL'
    )
  })

  it('returns empty list message when no links exist', async () => {
    linksServicesMock.getLinksByUserId.mockResolvedValue({ data: [] })

    const result = await processor.processAssistantMessage('.link -l', 99, undefined, false)

    expect(result.response).toBeTruthy()
    expect(result.response?.content).toContain('No tienes links')
  })
})

describe('MessageProcessor - reminder handling', () => {
  let processor: MessageProcessor

  beforeEach(() => {
    jest.clearAllMocks()
    redisRepositoryMock.getAlertSnoozeConfig.mockResolvedValue({ defaultSnoozeMinutes: 10 })
    processor = buildProcessor()
  })

  it('creates a personal daily reminder with .reminder', async () => {
    remindersServicesMock.createReminder.mockResolvedValue({
      data: {
        id: 12,
        message: 'drink water',
        recurrenceType: ReminderRecurrenceType.DAILY,
        timeOfDay: '09:00',
        status: ReminderStatus.ACTIVE,
        channelId: null,
      },
    })

    const result = await processor.processAssistantMessage(
      '.reminder drink water -rt daily -at 09:00',
      99,
      'D123',
      false
    )

    expect(remindersServicesMock.createReminder).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'drink water',
        recurrenceType: ReminderRecurrenceType.DAILY,
        timeOfDay: '09:00',
        status: ReminderStatus.ACTIVE,
        userId: 99,
        channelId: null,
      })
    )
    expect(result.response?.content).toContain('#12')
  })

  it('creates a channel weekly reminder with normalized channel scope', async () => {
    remindersServicesMock.createReminder.mockResolvedValue({
      data: {
        id: 22,
        message: 'team sync',
        recurrenceType: ReminderRecurrenceType.WEEKLY,
        timeOfDay: '10:30',
        weekDays: [ReminderWeekDay.MONDAY, ReminderWeekDay.WEDNESDAY, ReminderWeekDay.FRIDAY],
        status: ReminderStatus.ACTIVE,
        channelId: 'C123',
      },
    })

    await processor.processAssistantMessage(
      '.r team sync -rt weekly -wd mon,wed,fri -at 10:30',
      99,
      'C123',
      true
    )

    expect(remindersServicesMock.createReminder).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'team sync',
        recurrenceType: ReminderRecurrenceType.WEEKLY,
        timeOfDay: '10:30',
        weekDays: [ReminderWeekDay.MONDAY, ReminderWeekDay.WEDNESDAY, ReminderWeekDay.FRIDAY],
        status: ReminderStatus.ACTIVE,
        userId: 99,
        channelId: 'C123',
      })
    )
  })

  it('lists personal reminders with personal scope', async () => {
    remindersServicesMock.getRemindersByScope.mockResolvedValue({
      data: [
        {
          id: 1,
          message: 'Drink water',
          recurrenceType: ReminderRecurrenceType.DAILY,
          timeOfDay: '09:00',
          status: ReminderStatus.ACTIVE,
          channelId: null,
        },
      ],
    })

    const result = await processor.processAssistantMessage('.r -list', 99, undefined, false)

    expect(remindersServicesMock.getRemindersByScope).toHaveBeenCalledWith(99, {
      scope: ReminderScope.PERSONAL,
      channelId: null,
    })
    expect(result.response?.content).toContain('#1')
    expect(result.response?.content).toContain('personal')
  })

  it('lists channel reminders with channel scope', async () => {
    remindersServicesMock.getRemindersByScope.mockResolvedValue({
      data: [
        {
          id: 2,
          message: 'Standup',
          recurrenceType: ReminderRecurrenceType.DAILY,
          timeOfDay: '10:00',
          status: ReminderStatus.ACTIVE,
          channelId: 'C555',
        },
      ],
    })

    const result = await processor.processAssistantMessage('.r -list', 99, 'C555', true)

    expect(remindersServicesMock.getRemindersByScope).toHaveBeenCalledWith(99, {
      scope: ReminderScope.CHANNEL,
      channelId: 'C555',
    })
    expect(result.response?.content).toContain('channel')
  })

  it('checks reminder occurrence by id', async () => {
    remindersServicesMock.checkReminderOccurrence.mockResolvedValue({
      data: { id: 70, occurrenceDate: '2026-03-29' },
    })

    const result = await processor.processAssistantMessage('.r -check -id 12', 99, undefined, false)

    expect(remindersServicesMock.checkReminderOccurrence).toHaveBeenCalledWith(12, {
      userId: 99,
    })
    expect(result.response?.content).toContain('2026-03-29')
  })

  it('pauses reminder by id', async () => {
    remindersServicesMock.pauseReminder.mockResolvedValue({
      data: {
        id: 12,
        message: 'Drink water',
        recurrenceType: ReminderRecurrenceType.DAILY,
        timeOfDay: '09:00',
        status: ReminderStatus.PAUSED,
        channelId: null,
      },
    })

    const result = await processor.processAssistantMessage('.r -pause -id 12', 99, undefined, false)

    expect(remindersServicesMock.pauseReminder).toHaveBeenCalledWith(12, { userId: 99 })
    expect(result.response?.content).toContain('pausado')
  })

  it('resumes reminder by id', async () => {
    remindersServicesMock.resumeReminder.mockResolvedValue({
      data: {
        id: 12,
        message: 'Drink water',
        recurrenceType: ReminderRecurrenceType.DAILY,
        timeOfDay: '09:00',
        status: ReminderStatus.ACTIVE,
        channelId: null,
      },
    })

    const result = await processor.processAssistantMessage(
      '.r -resume -id 12',
      99,
      undefined,
      false
    )

    expect(remindersServicesMock.resumeReminder).toHaveBeenCalledWith(12, { userId: 99 })
    expect(result.response?.content).toContain('reanudado')
  })

  it('deletes reminder by id', async () => {
    remindersServicesMock.deleteReminder.mockResolvedValue({
      data: true,
    })

    const result = await processor.processAssistantMessage(
      '.r -delete -id 12',
      99,
      undefined,
      false
    )

    expect(remindersServicesMock.deleteReminder).toHaveBeenCalledWith(12, { userId: 99 })
    expect(result.response?.content).toContain('eliminado')
  })

  it('returns usage guidance when required reminder create flags are missing', async () => {
    const result = await processor.processAssistantMessage(
      '.r drink water -at 09:00',
      99,
      undefined,
      false
    )

    expect(result.response?.content).toBe(
      'Uso: .reminder <mensaje> -rt daily|weekly|monthly -at HH:mm [-wd mon,wed] [-md 1,15]'
    )
  })

  it('returns validation error when reminder weekdays are invalid', async () => {
    const result = await processor.processAssistantMessage(
      '.r team sync -rt weekly -wd foo -at 10:30',
      99
    )

    expect(result.response?.content).toBe('Día de semana inválido: foo')
  })

  it('returns an error when multiple reminder actions are combined', async () => {
    const result = await processor.processAssistantMessage('.r -list -pause -id 12', 99)

    expect(result.response?.content).toBe('Usa una sola acción por comando de reminder.')
  })
})

const mockClassification = (json: Record<string, unknown>): void => {
  aiRepositoryMock.chatCompletion.mockResolvedValue({ content: JSON.stringify(json) })
}

describe('MessageProcessor - reminder classifier intents', () => {
  let processor: MessageProcessor

  beforeEach(() => {
    jest.clearAllMocks()
    redisRepositoryMock.getAlertSnoozeConfig.mockResolvedValue({ defaultSnoozeMinutes: 10 })
    processor = buildProcessor()
  })

  it('creates a daily reminder from a natural-language request (reminder.create)', async () => {
    mockClassification({
      intent: 'reminder.create',
      message: 'tomar agua',
      recurrenceType: 'daily',
      timeOfDay: '09:00',
    })
    remindersServicesMock.createReminder.mockResolvedValue({
      data: {
        id: 31,
        message: 'tomar agua',
        recurrenceType: ReminderRecurrenceType.DAILY,
        timeOfDay: '09:00',
        status: ReminderStatus.ACTIVE,
        channelId: null,
      },
    })

    const result = await processor.processAssistantMessage(
      'Recordame todos los días a las 9 tomar agua',
      99,
      undefined,
      false
    )

    expect(remindersServicesMock.createReminder).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'tomar agua',
        recurrenceType: ReminderRecurrenceType.DAILY,
        timeOfDay: '09:00',
        userId: 99,
        channelId: null,
      })
    )
    expect(result.response?.content).toContain('#31')
  })

  it('maps weekday names to ReminderWeekDay for a weekly reminder.create', async () => {
    mockClassification({
      intent: 'reminder.create',
      message: 'reunión de equipo',
      recurrenceType: 'weekly',
      weekDays: ['monday'],
      timeOfDay: '09:00',
    })
    remindersServicesMock.createReminder.mockResolvedValue({
      data: {
        id: 32,
        message: 'reunión de equipo',
        recurrenceType: ReminderRecurrenceType.WEEKLY,
        timeOfDay: '09:00',
        weekDays: [ReminderWeekDay.MONDAY],
        status: ReminderStatus.ACTIVE,
        channelId: null,
      },
    })

    const result = await processor.processAssistantMessage(
      'Recordatorio recurrente todos los lunes a las 9 reunión de equipo',
      99,
      undefined,
      false
    )

    expect(remindersServicesMock.createReminder).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'reunión de equipo',
        recurrenceType: ReminderRecurrenceType.WEEKLY,
        weekDays: [ReminderWeekDay.MONDAY],
        timeOfDay: '09:00',
        userId: 99,
      })
    )
    expect(result.response?.content).toContain('#32')
  })

  it('returns a validation message when reminder.create has an invalid recurrence', async () => {
    mockClassification({
      intent: 'reminder.create',
      message: 'algo',
      recurrenceType: 'yearly',
      timeOfDay: '09:00',
    })

    const result = await processor.processAssistantMessage(
      'Recordame cada año algo a las 9',
      99,
      undefined,
      false
    )

    expect(remindersServicesMock.createReminder).not.toHaveBeenCalled()
    expect(result.response?.content).toBe('Recurrencia inválida. Usa daily, weekly o monthly.')
  })

  it('returns a validation error for unrecognized weekday names without crashing', async () => {
    mockClassification({
      intent: 'reminder.create',
      message: 'algo',
      recurrenceType: 'weekly',
      weekDays: ['funday'],
      timeOfDay: '09:00',
    })

    const result = await processor.processAssistantMessage(
      'Recordame todos los funday algo a las 9',
      99,
      undefined,
      false
    )

    expect(remindersServicesMock.createReminder).not.toHaveBeenCalled()
    expect(result.response?.content).toContain('Día de semana inválido: funday')
  })

  it('lists reminders deriving channel scope (reminder.list)', async () => {
    mockClassification({ intent: 'reminder.list' })
    remindersServicesMock.getRemindersByScope.mockResolvedValue({
      data: [
        {
          id: 5,
          message: 'Standup',
          recurrenceType: ReminderRecurrenceType.DAILY,
          timeOfDay: '10:00',
          status: ReminderStatus.ACTIVE,
          channelId: 'C777',
        },
      ],
    })

    const result = await processor.processAssistantMessage('Listá mis reminders', 99, 'C777', true)

    expect(remindersServicesMock.getRemindersByScope).toHaveBeenCalledWith(99, {
      scope: ReminderScope.CHANNEL,
      channelId: 'C777',
    })
    expect(result.response?.content).toContain('#5')
  })

  it('pauses a reminder by targetId (reminder.pause)', async () => {
    mockClassification({ intent: 'reminder.pause', targetId: 12 })
    remindersServicesMock.pauseReminder.mockResolvedValue({
      data: {
        id: 12,
        message: 'Drink water',
        recurrenceType: ReminderRecurrenceType.DAILY,
        timeOfDay: '09:00',
        status: ReminderStatus.PAUSED,
        channelId: null,
      },
    })

    const result = await processor.processAssistantMessage(
      'Pausá el reminder 12',
      99,
      undefined,
      false
    )

    expect(remindersServicesMock.pauseReminder).toHaveBeenCalledWith(12, { userId: 99 })
    expect(result.response?.content).toContain('pausado')
  })

  it('shows reminder detail via targetId (reminder.detail)', async () => {
    mockClassification({ intent: 'reminder.detail', targetId: 12 })
    remindersServicesMock.getReminderById.mockResolvedValue({
      data: {
        id: 12,
        message: 'Drink water',
        recurrenceType: ReminderRecurrenceType.DAILY,
        timeOfDay: '09:00',
        status: ReminderStatus.ACTIVE,
        channelId: null,
      },
    })

    const result = await processor.processAssistantMessage(
      'Mostrame el reminder 12',
      99,
      undefined,
      false
    )

    expect(remindersServicesMock.getReminderById).toHaveBeenCalledWith(12, { userId: 99 })
    expect(result.response?.content).toContain('#12')
  })

  it('returns a usage message when an id-based intent is missing the id', async () => {
    mockClassification({ intent: 'reminder.pause' })

    const result = await processor.processAssistantMessage(
      'Pausá el reminder',
      99,
      undefined,
      false
    )

    expect(remindersServicesMock.pauseReminder).not.toHaveBeenCalled()
    expect(result.response?.content).toContain('Necesito un id válido')
  })

  it('surfaces a not-found error from the service for an id-based intent', async () => {
    mockClassification({ intent: 'reminder.pause', targetId: 999 })
    remindersServicesMock.pauseReminder.mockResolvedValue({ error: 'Reminder not found' })

    const result = await processor.processAssistantMessage(
      'Pausá el reminder 999',
      99,
      undefined,
      false
    )

    expect(remindersServicesMock.pauseReminder).toHaveBeenCalledWith(999, { userId: 99 })
    expect(result.response?.content).toBe('Reminder not found')
  })
})

describe('MessageProcessor - image classifier intent (image.create)', () => {
  let processor: MessageProcessor

  beforeEach(() => {
    jest.clearAllMocks()
    redisRepositoryMock.getAlertSnoozeConfig.mockResolvedValue({ defaultSnoozeMinutes: 10 })
    processor = buildProcessor()
  })

  it('generates an image from a natural-language request', async () => {
    mockClassification({ intent: 'image.create', prompt: 'a dog' })
    imagesServicesMock.generateImageForAssistant.mockResolvedValue({
      images: [{ url: 'https://example.com/dog.png', id: '1', createdAt: new Date() }],
      provider: 'openai',
    })

    const result = await processor.processAssistantMessage(
      'crea una imagen de un perro',
      99,
      undefined,
      false
    )

    expect(imagesServicesMock.generateImageForAssistant).toHaveBeenCalledWith('a dog', 99, {})
    expect(result.response?.content).toContain('Generated')
  })

  it('responds with an error message when generation fails (no silent null)', async () => {
    mockClassification({ intent: 'image.create', prompt: 'a dog' })
    imagesServicesMock.generateImageForAssistant.mockResolvedValue(null)

    const result = await processor.processAssistantMessage(
      'crea una imagen de un perro',
      99,
      undefined,
      false
    )

    expect(result.response?.content).toContain('❌ Error al generar la imagen')
  })

  it('responds with an error message when generation throws', async () => {
    mockClassification({ intent: 'image.create', prompt: 'a dog' })
    imagesServicesMock.generateImageForAssistant.mockRejectedValue(new Error('boom'))

    const result = await processor.processAssistantMessage(
      'crea una imagen de un perro',
      99,
      undefined,
      false
    )

    expect(result.response?.content).toContain('❌ Error al generar la imagen')
  })
})

describe('MessageProcessor - onProgress callback', () => {
  let processor: MessageProcessor

  beforeEach(() => {
    jest.clearAllMocks()
    redisRepositoryMock.getAlertSnoozeConfig.mockResolvedValue({ defaultSnoozeMinutes: 10 })
    processor = buildProcessor()
  })

  it('calls onProgress with "Generando imagen..." before image generation via .img', async () => {
    const onProgress = jest.fn()

    imagesServicesMock.generateImageForAssistant.mockResolvedValue({
      images: [{ url: 'https://example.com/img.png', id: '1', createdAt: new Date() }],
      provider: 'openai',
    })

    await processor.processAssistantMessage(
      '.img a cat',
      99,
      undefined,
      false,
      undefined,
      onProgress
    )

    expect(onProgress).toHaveBeenCalledWith('Generando imagen...')
  })

  it('does not fail when onProgress is undefined', async () => {
    imagesServicesMock.generateImageForAssistant.mockResolvedValue({
      images: [{ url: 'https://example.com/img.png', id: '1', createdAt: new Date() }],
      provider: 'openai',
    })

    const result = await processor.processAssistantMessage(
      '.img a cat',
      99,
      undefined,
      false,
      undefined,
      undefined
    )

    expect(result.response).toBeTruthy()
  })

  it('does not call onProgress for fast operations like alert create', async () => {
    const onProgress = jest.fn()

    alertsServicesMock.createAssistantAlert.mockResolvedValue({
      data: { id: 1, date: new Date(), message: 'Test' },
    })

    await processor.processAssistantMessage(
      '.alert 10m test reminder',
      99,
      undefined,
      false,
      undefined,
      onProgress
    )

    expect(onProgress).not.toHaveBeenCalled()
  })
})

describe('MessageProcessor - translate handling', () => {
  let processor: MessageProcessor

  beforeEach(() => {
    jest.clearAllMocks()
    redisRepositoryMock.getAlertSnoozeConfig.mockResolvedValue({ defaultSnoozeMinutes: 10 })
    processor = buildProcessor()
  })

  it('translates text successfully with .translate command', async () => {
    translateServicesMock.translate.mockResolvedValue({
      data: { translatedText: 'Hola mundo' },
    })

    const result = await processor.processAssistantMessage('.translate Spanish Hello world', 99)

    expect(translateServicesMock.translate).toHaveBeenCalledWith('Hello world', 'spanish')
    expect(result.response.content).toBe('Hola mundo')
  })

  it('translates text successfully with .tr shorthand', async () => {
    translateServicesMock.translate.mockResolvedValue({
      data: { translatedText: 'Bonjour' },
    })

    const result = await processor.processAssistantMessage('.tr French Hello', 99)

    expect(translateServicesMock.translate).toHaveBeenCalledWith('Hello', 'french')
    expect(result.response.content).toBe('Bonjour')
  })

  it('throws a usage error when no language and text provided', async () => {
    await expect(processor.processAssistantMessage('.translate', 99)).rejects.toThrow(
      'Uso: .translate <idioma> <texto> o .tr <idioma> <texto>'
    )
  })

  it('throws a usage error when only language is provided without text', async () => {
    await expect(processor.processAssistantMessage('.translate Spanish', 99)).rejects.toThrow(
      'Uso: .translate <idioma> <texto> o .tr <idioma> <texto>'
    )
  })

  it('throws a validation error when targetLang contains invalid characters', async () => {
    await expect(
      processor.processAssistantMessage('.translate Spa\nnish Hello world', 99)
    ).rejects.toThrow('Parámetros inválidos:')
  })

  it('throws a validation error when targetLang exceeds max length', async () => {
    const longLang = 'A'.repeat(51)
    await expect(
      processor.processAssistantMessage(`.translate ${longLang} Hello world`, 99)
    ).rejects.toThrow('Parámetros inválidos:')
  })

  it('throws a validation error when text exceeds max length of 5000 characters', async () => {
    const longText = 'a'.repeat(5001)
    await expect(
      processor.processAssistantMessage(`.translate Spanish ${longText}`, 99)
    ).rejects.toThrow('Parámetros inválidos:')
  })

  it('throws an error when translate service returns an error', async () => {
    translateServicesMock.translate.mockResolvedValue({
      error: 'Translation failed',
    })

    await expect(
      processor.processAssistantMessage('.translate Spanish Hello world', 99)
    ).rejects.toThrow('Translation failed')
  })
})

describe('MessageProcessor - QR handling', () => {
  let processor: MessageProcessor

  beforeEach(() => {
    jest.clearAllMocks()
    redisRepositoryMock.getAlertSnoozeConfig.mockResolvedValue({ defaultSnoozeMinutes: 10 })
    processor = buildProcessor()
  })

  it('generates QR code successfully with .qr command', async () => {
    qrServicesMock.generateQr.mockResolvedValue({
      data: { qrBase64: 'data:image/png;base64,abc123' },
    })

    const result = await processor.processAssistantMessage('.qr https://example.com', 99)

    expect(qrServicesMock.generateQr).toHaveBeenCalledWith('https://example.com')
    expect(result.response.content).toBe('data:image/png;base64,abc123')
  })

  it('throws a usage error when no text provided', async () => {
    await expect(processor.processAssistantMessage('.qr', 99)).rejects.toThrow(
      'Uso: .qr <texto o URL>'
    )
  })

  it('throws a usage error when only whitespace provided', async () => {
    await expect(processor.processAssistantMessage('.qr   ', 99)).rejects.toThrow(
      'Uso: .qr <texto o URL>'
    )
  })

  it('throws an error when QR service returns an error', async () => {
    qrServicesMock.generateQr.mockResolvedValue({
      error: 'Error inesperado al generar el código QR',
    })

    await expect(processor.processAssistantMessage('.qr test', 99)).rejects.toThrow(
      'Error inesperado al generar el código QR'
    )
  })
})

// S5 delegation coverage. Before the rewire this file had no snooze/repeat command
// coverage at all, so a swapped argument (a preset key instead of minutes, the wrong
// repeat policy, a flipped updatePreference) would have compiled, linted and passed
// the whole baseline suite silently. These cases pin the forwarding contract only —
// the behavior itself is owned and tested by AlertInteractionsService.
describe('MessageProcessor - alert commands delegate to AlertInteractionsService', () => {
  let processor: MessageProcessor

  beforeEach(() => {
    jest.clearAllMocks()
    processor = buildProcessor(alertInteractionsServiceMock)
    alertInteractionsServiceMock.getDefaultSnoozeMinutes.mockResolvedValue(10)
    alertInteractionsServiceMock.snoozeAlert.mockResolvedValue('ok')
    alertInteractionsServiceMock.repeatAlert.mockResolvedValue('ok')
    alertInteractionsServiceMock.listAlertsByScope.mockResolvedValue('ok')
  })

  describe('snooze #id [N][m|h] (AC-10)', () => {
    // AC-10: the text path keeps its preference write. It forwards an explicit
    // `minutes` amount, never a presetKey, and `updatePreference` is true exactly
    // when the user typed an amount. This is the deliberate divergence from the
    // Slack-button path, which always passes `updatePreference: false`.
    it('forwards an explicit minute amount with updatePreference true', async () => {
      await processor.processAssistantMessage('snooze #7 30m', 42)

      expect(alertInteractionsServiceMock.snoozeAlert).toHaveBeenCalledWith(7, 42, {
        minutes: 30,
        updatePreference: true,
      })
      expect(alertInteractionsServiceMock.getDefaultSnoozeMinutes).not.toHaveBeenCalled()
    })

    it('converts an explicit hour amount to minutes, still with updatePreference true', async () => {
      await processor.processAssistantMessage('snooze #7 2h', 42)

      expect(alertInteractionsServiceMock.snoozeAlert).toHaveBeenCalledWith(7, 42, {
        minutes: 120,
        updatePreference: true,
      })
    })

    it('falls back to the stored preference with updatePreference false when no amount is typed', async () => {
      alertInteractionsServiceMock.getDefaultSnoozeMinutes.mockResolvedValue(25)

      await processor.processAssistantMessage('snooze #7', 42)

      expect(alertInteractionsServiceMock.getDefaultSnoozeMinutes).toHaveBeenCalledWith(42)
      expect(alertInteractionsServiceMock.snoozeAlert).toHaveBeenCalledWith(7, 42, {
        minutes: 25,
        updatePreference: false,
      })
    })

    it('never forwards a presetKey from the text path', async () => {
      await processor.processAssistantMessage('snooze #7 30m', 42)

      const options = alertInteractionsServiceMock.snoozeAlert.mock.calls[0][2]
      expect(options).not.toHaveProperty('presetKey')
    })

    it('returns a string result verbatim as the assistant content', async () => {
      alertInteractionsServiceMock.snoozeAlert.mockResolvedValue(
        'El snooze debe ser mayor a 1 minuto.'
      )

      const result = await processor.processAssistantMessage('snooze #7 30m', 42)

      expect(result.response?.content).toBe('El snooze debe ser mayor a 1 minuto.')
    })

    it('does not delegate for an invalid amount', async () => {
      const result = await processor.processAssistantMessage('snooze #7 0m', 42)

      expect(alertInteractionsServiceMock.snoozeAlert).not.toHaveBeenCalled()
      expect(result.response?.content).toBe('Usa minutos u horas válidas para snooze.')
    })
  })

  describe('repeat #id daily|weekly (AC-14)', () => {
    it.each([
      ['daily', 'daily'],
      ['weekly', 'weekly'],
    ])('forwards the %s policy without a minute count', async (typed, policy) => {
      await processor.processAssistantMessage(`repeat #9 ${typed}`, 42)

      expect(alertInteractionsServiceMock.repeatAlert).toHaveBeenCalledWith(9, 42, policy)
    })
  })

  describe('alerts <scope> (AC-14)', () => {
    it.each([
      ['pending', 'pending'],
      ['pendientes', 'pending'],
      ['all', 'all'],
      ['todas', 'all'],
      ['snoozed', 'snoozed'],
      ['snoozeadas', 'snoozed'],
      ['resolved', 'resolved'],
      ['resueltas', 'resolved'],
      ['overdue', 'overdue'],
      ['atrasadas', 'overdue'],
    ])('maps "alerts %s" to the %s scope', async (typed, scope) => {
      await processor.processAssistantMessage(`alerts ${typed}`, 42, 'C1', true)

      expect(alertInteractionsServiceMock.listAlertsByScope).toHaveBeenCalledWith(42, scope, 'C1')
    })

    it('passes a null channel scope outside a channel context', async () => {
      await processor.processAssistantMessage('alerts pending', 42, 'D1', false)

      expect(alertInteractionsServiceMock.listAlertsByScope).toHaveBeenCalledWith(
        42,
        'pending',
        null
      )
    })
  })

  describe('set snooze <N><m|h> (AC-2)', () => {
    it('forwards the preference write to the service', async () => {
      await processor.processAssistantMessage('set snooze 15m', 42)

      expect(alertInteractionsServiceMock.setDefaultSnoozeMinutes).toHaveBeenCalledWith(42, 15)
    })

    it('converts hours before writing the preference', async () => {
      await processor.processAssistantMessage('set snooze 2h', 42)

      expect(alertInteractionsServiceMock.setDefaultSnoozeMinutes).toHaveBeenCalledWith(42, 120)
    })
  })
})
