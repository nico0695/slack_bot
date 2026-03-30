import MessageProcessor from '../messageProcessor.service'
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

const buildProcessor = (): MessageProcessor =>
  new MessageProcessor(
    aiRepositoryMock as any,
    redisRepositoryMock as any,
    alertsServicesMock as any,
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

    // Note: -s is shorthand for -size, -qty for -quality, -st for -style, -num for -number
    const result = await processor.processAssistantMessage(
      '.img a cat -size 1024x1792 -quality hd -style vivid -num 2',
      99,
      undefined,
      false
    )

    expect(imagesServicesMock.generateImageForAssistant).toHaveBeenCalledWith('a cat', 99, {
      size: '1024x1792',
      quality: 'hd',
      style: 'vivid',
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
