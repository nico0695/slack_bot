import { parseQrInput, resolveVisualOptions } from '../qrParser.utils'
import { QR_DEFAULTS } from '../../constants/qr.constants'

describe('parseQrInput', () => {
  it('parses plain text content', () => {
    const result = parseQrInput('hello world')
    expect(result.content).toBe('hello world')
    expect(result.visualOptions).toEqual({})
  })

  it('parses a URL', () => {
    const result = parseQrInput('https://example.com')
    expect(result.content).toBe('https://example.com')
  })

  it('extracts -fg flag', () => {
    const result = parseQrInput('hello -fg #FF0000')
    expect(result.content).toBe('hello')
    expect(result.visualOptions.foregroundColor).toBe('#FF0000')
  })

  it('extracts -bg flag', () => {
    const result = parseQrInput('hello -bg #00FF00')
    expect(result.content).toBe('hello')
    expect(result.visualOptions.backgroundColor).toBe('#00FF00')
  })

  it('extracts -e flag', () => {
    const result = parseQrInput('hello -e H')
    expect(result.content).toBe('hello')
    expect(result.visualOptions.errorCorrectionLevel).toBe('H')
  })

  it('extracts all visual flags together', () => {
    const result = parseQrInput('my content -fg #111111 -bg #222222 -e Q')
    expect(result.content).toBe('my content')
    expect(result.visualOptions.foregroundColor).toBe('#111111')
    expect(result.visualOptions.backgroundColor).toBe('#222222')
    expect(result.visualOptions.errorCorrectionLevel).toBe('Q')
  })

  it('handles -wa shortcut', () => {
    const result = parseQrInput('-wa 5491155551234 Hola que tal')
    expect(result.content).toBe('https://wa.me/5491155551234?text=Hola%20que%20tal')
  })

  it('handles -tl shortcut', () => {
    const result = parseQrInput('-tl myuser')
    expect(result.content).toBe('https://t.me/myuser')
  })

  it('handles -ig shortcut', () => {
    const result = parseQrInput('-ig myuser')
    expect(result.content).toBe('https://instagram.com/myuser')
  })

  it('handles -wifi shortcut', () => {
    const result = parseQrInput('-wifi MyNetwork secret123')
    expect(result.content).toBe('WIFI:T:WPA;S:MyNetwork;P:secret123;;')
  })

  it('handles -mail shortcut', () => {
    const result = parseQrInput('-mail user@example.com Hello World')
    expect(result.content).toBe('mailto:user@example.com?subject=Hello%20World')
  })

  it('handles shortcuts with visual flags', () => {
    const result = parseQrInput('-tl myuser -fg #FF0000')
    expect(result.content).toBe('https://t.me/myuser')
    expect(result.visualOptions.foregroundColor).toBe('#FF0000')
  })

  it('returns raw content for invalid shortcut args', () => {
    const result = parseQrInput('-wa')
    expect(result.content).toBe('-wa')
  })

  it('handles empty input', () => {
    const result = parseQrInput('')
    expect(result.content).toBe('')
  })

  it('trims whitespace', () => {
    const result = parseQrInput('  hello  ')
    expect(result.content).toBe('hello')
  })
})

describe('resolveVisualOptions', () => {
  it('returns defaults when no options provided', () => {
    const result = resolveVisualOptions({})
    expect(result).toEqual(QR_DEFAULTS)
  })

  it('merges partial options with defaults', () => {
    const result = resolveVisualOptions({ foregroundColor: '#FF0000' })
    expect(result.foregroundColor).toBe('#FF0000')
    expect(result.backgroundColor).toBe(QR_DEFAULTS.backgroundColor)
    expect(result.errorCorrectionLevel).toBe(QR_DEFAULTS.errorCorrectionLevel)
  })

  it('overrides all options', () => {
    const result = resolveVisualOptions({
      foregroundColor: '#111111',
      backgroundColor: '#222222',
      errorCorrectionLevel: 'H',
    })
    expect(result.foregroundColor).toBe('#111111')
    expect(result.backgroundColor).toBe('#222222')
    expect(result.errorCorrectionLevel).toBe('H')
  })
})
