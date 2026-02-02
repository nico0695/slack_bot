import {
  buildUserDataContext,
  formatCompactAlerts,
  formatCompactTasks,
  formatCompactNotes,
  formatConversationHistory,
} from '../userContext.utils'
import { Alerts } from '../../../../../entities/alerts'
import { Tasks } from '../../../../../entities/tasks'
import { Notes } from '../../../../../entities/notes'
import { IUserConversation } from '../../interfaces/converstions'
import { ConversationProviders } from '../../constants/conversationFlow'
import { roleTypes } from '../../constants/openai'

const createAlert = (data: Partial<Alerts>): Alerts =>
  ({
    id: 1,
    message: 'Test',
    date: new Date(),
    sent: false,
    channelId: '',
    user: null,
    createdAt: new Date(),
    deletedAt: null,
    ...data,
  }) as unknown as Alerts

const createTask = (data: Partial<Tasks>): Tasks =>
  ({
    id: 1,
    title: 'Test',
    description: '',
    status: 'pending',
    alertDate: null,
    tag: '',
    channelId: '',
    user: null,
    createdAt: new Date(),
    deletedAt: null,
    ...data,
  }) as unknown as Tasks

const createNote = (data: Partial<Notes>): Notes =>
  ({
    id: 1,
    title: 'Test',
    description: '',
    tag: '',
    channelId: '',
    user: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...data,
  }) as unknown as Notes

const createMessage = (role: roleTypes, content: string): IUserConversation => ({
  role,
  content,
  provider: ConversationProviders.ASSISTANT,
})

describe('buildUserDataContext', () => {
  it('returns [SIN_DATOS_PREVIOS] when no data provided', () => {
    expect(buildUserDataContext({})).toBe('[SIN_DATOS_PREVIOS]')
    expect(buildUserDataContext({ alerts: [], tasks: [], notes: [] })).toBe('[SIN_DATOS_PREVIOS]')
  })

  it('includes alerts when provided', () => {
    const alerts = [createAlert({ id: 1, message: 'Test alert' })]
    const result = buildUserDataContext({ alerts })
    expect(result).toContain('[A:1]')
    expect(result).toContain('#1"Test alert"')
  })

  it('includes tasks when provided', () => {
    const tasks = [createTask({ id: 5, title: 'Test task', tag: 'work' })]
    const result = buildUserDataContext({ tasks })
    expect(result).toContain('[T:1]')
    expect(result).toContain('#5"Test task"[work]')
  })

  it('includes notes when provided', () => {
    const notes = [createNote({ id: 10, title: 'Test note' })]
    const result = buildUserDataContext({ notes })
    expect(result).toContain('[N:1]')
    expect(result).toContain('#10"Test note"')
  })

  it('combines all data types', () => {
    const data = {
      alerts: [createAlert({ id: 1, message: 'Alert' })],
      tasks: [createTask({ id: 2, title: 'Task' })],
      notes: [createNote({ id: 3, title: 'Note' })],
    }
    const result = buildUserDataContext(data)
    expect(result).toContain('[A:1]')
    expect(result).toContain('[T:1]')
    expect(result).toContain('[N:1]')
  })

  it('respects maxItems option', () => {
    const alerts = [
      createAlert({ id: 1, message: 'Alert 1', date: new Date('2024-01-01') }),
      createAlert({ id: 2, message: 'Alert 2', date: new Date('2024-01-02') }),
      createAlert({ id: 3, message: 'Alert 3', date: new Date('2024-01-03') }),
    ]
    const result = buildUserDataContext({ alerts }, { maxItems: 2 })
    expect(result).toContain('[A:3]')
    expect(result).toContain('#1"Alert 1"')
    expect(result).toContain('#2"Alert 2"')
    expect(result).not.toContain('#3"Alert 3"')
  })
})

describe('formatCompactAlerts', () => {
  it('sorts alerts by date ascending', () => {
    const alerts = [
      createAlert({ id: 2, message: 'Later', date: new Date('2024-01-02') }),
      createAlert({ id: 1, message: 'Earlier', date: new Date('2024-01-01') }),
    ]
    const result = formatCompactAlerts(alerts, 5)
    expect(result.indexOf('#1')).toBeLessThan(result.indexOf('#2'))
  })

  it('shows total count even when limited', () => {
    const alerts = Array.from({ length: 10 }, (_, i) =>
      createAlert({ id: i + 1, message: `Alert ${i + 1}` })
    )
    const result = formatCompactAlerts(alerts, 3)
    expect(result).toContain('[A:10]')
  })
})

describe('formatCompactTasks', () => {
  it('includes tag when present', () => {
    const tasks = [createTask({ id: 1, title: 'Task', tag: 'urgent' })]
    const result = formatCompactTasks(tasks, 5)
    expect(result).toContain('[urgent]')
  })

  it('omits tag brackets when tag is empty', () => {
    const tasks = [createTask({ id: 1, title: 'Task', tag: '' })]
    const result = formatCompactTasks(tasks, 5)
    expect(result).not.toContain('[]')
  })
})

describe('formatCompactNotes', () => {
  it('includes tag when present', () => {
    const notes = [createNote({ id: 1, title: 'Note', tag: 'ideas' })]
    const result = formatCompactNotes(notes, 5)
    expect(result).toContain('[ideas]')
  })
})

describe('formatConversationHistory', () => {
  it('returns empty string for empty array', () => {
    expect(formatConversationHistory([])).toBe('')
    expect(formatConversationHistory(null as any)).toBe('')
    expect(formatConversationHistory(undefined as any)).toBe('')
  })

  it('formats user messages with U: prefix', () => {
    const messages = [createMessage(roleTypes.user, 'Hello')]
    const result = formatConversationHistory(messages)
    expect(result).toBe('U:Hello')
  })

  it('formats assistant messages with A: prefix', () => {
    const messages = [createMessage(roleTypes.assistant, 'Hi there')]
    const result = formatConversationHistory(messages)
    expect(result).toBe('A:Hi there')
  })

  it('joins multiple messages with newline', () => {
    const messages = [
      createMessage(roleTypes.user, 'Hello'),
      createMessage(roleTypes.assistant, 'Hi'),
      createMessage(roleTypes.user, 'How are you?'),
    ]
    const result = formatConversationHistory(messages)
    expect(result).toBe('U:Hello\nA:Hi\nU:How are you?')
  })

  it('respects maxMessages limit and takes from end', () => {
    const messages = [
      createMessage(roleTypes.user, 'First'),
      createMessage(roleTypes.assistant, 'Second'),
      createMessage(roleTypes.user, 'Third'),
      createMessage(roleTypes.assistant, 'Fourth'),
    ]
    const result = formatConversationHistory(messages, 2)
    expect(result).toBe('U:Third\nA:Fourth')
    expect(result).not.toContain('First')
  })

  it('truncates long messages', () => {
    const longMessage = 'a'.repeat(100)
    const messages = [createMessage(roleTypes.user, longMessage)]
    const result = formatConversationHistory(messages)
    expect(result.length).toBeLessThan(100)
    expect(result).toContain('..')
  })
})
