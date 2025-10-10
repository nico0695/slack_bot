import { extractVariablesAndFlags } from '../conversation.utils'

describe('extractVariablesAndFlags', () => {
  it('extracts variables and flags while preserving clean message text', () => {
    const result = extractVariablesAndFlags('.alert 10:00 review details -urgent')

    expect(result).toEqual({
      cleanMessage: 'review details',
      variables: { alert: '10:00' },
      flags: ['-urgent'],
    })
  })

  it('supports multiple variables and flags in the same message', () => {
    const result = extractVariablesAndFlags('hello .task focus -flag extra -list world .note quick')

    expect(result.cleanMessage.replace(/\s+/g, ' ').trim()).toBe('hello extra world')
    expect(result.variables).toEqual({ task: 'focus', note: 'quick' })
    expect(result.flags).toEqual(['-flag', '-list'])
  })

  it('ignores variables without a provided value', () => {
    const result = extractVariablesAndFlags('plain message .note')

    expect(result.cleanMessage).toBe('plain message .note')
    expect(result.variables).toEqual({})
    expect(result.flags).toEqual([])
  })
})
