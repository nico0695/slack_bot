import { AssistantMessage } from '../asistantMessage.utils'
import { AssistantsFlags, AssistantsVariables } from '../../constants/assistant.constants'

describe('AssistantMessage', () => {
  it('throws when message is empty', () => {
    expect(() => new AssistantMessage('')).toThrow('Message is required')
  })

  it('parses alert command capturing value and clean message', () => {
    const assistantMessage = new AssistantMessage('.alert 10m check tasks now')

    expect(assistantMessage.variable).toBe(AssistantsVariables.ALERT)
    expect(assistantMessage.value).toBe('10m')
    expect(assistantMessage.cleanMessage.trim()).toBe('check tasks now')
    expect(assistantMessage.flags).toEqual({})
  })

  it('supports multi word task titles and description flags', () => {
    const assistantMessage = new AssistantMessage(
      '.task prepare deck -description finalize slides quickly'
    )

    expect(assistantMessage.variable).toBe(AssistantsVariables.TASK)
    expect(assistantMessage.value).toBe('prepare deck')
    expect(assistantMessage.cleanMessage).toBe('')
    expect(assistantMessage.flags).toEqual({
      [AssistantsFlags.DESCRIPTION]: 'finalize slides quickly',
    })
  })

  it('applies default flag values when present in configuration', () => {
    const assistantMessage = new AssistantMessage('.alert 11:00 call client -list')

    expect(assistantMessage.flags).toEqual({
      [AssistantsFlags.LIST]: true,
    })
  })

  it('keeps configured default value when no explicit value is provided', () => {
    const assistantMessage = new AssistantMessage('.question should I join?')

    expect(assistantMessage.variable).toBe(AssistantsVariables.QUESTION)
    expect(assistantMessage.value).toBe(true)
    expect(assistantMessage.cleanMessage.trim()).toBe('should I join?')
  })

  it('collects multi word flag values for notes', () => {
    const assistantMessage = new AssistantMessage('.note capture ideas -list -listTag important updates only')

    expect(assistantMessage.variable).toBe(AssistantsVariables.NOTE)
    expect(assistantMessage.value).toBe('capture ideas')
    expect(assistantMessage.flags).toEqual({
      [AssistantsFlags.LIST]: true,
      [AssistantsFlags.LIST_TAG]: 'important updates only',
    })
    expect(assistantMessage.cleanMessage).toBe('')
  })
})
