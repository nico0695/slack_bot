import { truncateText } from '../string.utils'

describe('truncateText', () => {
  it('returns empty string for null/undefined input', () => {
    expect(truncateText(null as any, 10)).toBe('')
    expect(truncateText(undefined as any, 10)).toBe('')
    expect(truncateText('', 10)).toBe('')
  })

  it('returns original text if shorter than maxLength', () => {
    expect(truncateText('hello', 10)).toBe('hello')
    expect(truncateText('test', 4)).toBe('test')
  })

  it('truncates and adds ".." when text exceeds maxLength', () => {
    expect(truncateText('hello world', 8)).toBe('hello ..')
    expect(truncateText('this is a long message', 10)).toBe('this is ..')
  })

  it('normalizes multiple spaces to single space', () => {
    expect(truncateText('hello    world', 20)).toBe('hello world')
    expect(truncateText('  spaced   text  ', 20)).toBe('spaced text')
  })

  it('trims whitespace', () => {
    expect(truncateText('  hello  ', 10)).toBe('hello')
  })

  it('handles exact length correctly', () => {
    expect(truncateText('exact', 5)).toBe('exact')
  })

  it('handles edge case of very short maxLength', () => {
    expect(truncateText('hello', 3)).toBe('h..')
    expect(truncateText('ab', 2)).toBe('ab')
  })
})
