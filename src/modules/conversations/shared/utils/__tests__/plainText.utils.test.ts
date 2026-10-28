import {
  alertPlainTextLine,
  formatPlainTextList,
  generatedImagesOmittedText,
  linkPlainTextLine,
  normalizePlainText,
  notePlainTextLine,
  PLAIN_TEXT_LIST_MAX_ITEMS,
  taskPlainTextLine,
  TRUNCATED_NOTICE,
  truncatePlainText,
} from '../plainText.utils'

jest.mock('../../../../../shared/utils/dates.utils', () => ({
  formatDateToText: jest.fn(() => '28/10/2026 10:00'),
}))

describe('plainText utils', () => {
  describe('formatPlainTextList', () => {
    it('joins the header and every line', () => {
      expect(formatPlainTextList('Tus tareas:', ['#1 - a', '#2 - b'], 'No tienes tareas')).toBe(
        'Tus tareas:\n#1 - a\n#2 - b'
      )
    })

    it('returns only the empty text without items', () => {
      expect(formatPlainTextList('Tus tareas:', [], 'No tienes tareas')).toBe('No tienes tareas')
    })

    it(`caps the list at ${PLAIN_TEXT_LIST_MAX_ITEMS} items and counts the rest`, () => {
      const lines = Array.from({ length: 13 }, (_, i) => `#${i + 1}`)

      const text = formatPlainTextList('Header', lines, 'vacío')

      expect(text.split('\n')).toEqual(['Header', ...lines.slice(0, 10), 'y 3 más'])
    })

    it('does not add the tail when the list fits exactly', () => {
      const lines = Array.from({ length: 10 }, (_, i) => `#${i + 1}`)

      expect(formatPlainTextList('Header', lines, 'vacío')).not.toContain('más')
    })
  })

  describe('item lines', () => {
    it('formats an alert with its date', () => {
      expect(alertPlainTextLine({ id: 4, message: 'Llamar al médico', date: new Date() })).toBe(
        '#4 - Llamar al médico (28/10/2026 10:00)'
      )
    })

    it('formats tasks and notes with an optional description', () => {
      expect(taskPlainTextLine({ id: 1, title: 'Comprar pan', description: 'integral' })).toBe(
        '#1 - Comprar pan: integral'
      )
      expect(taskPlainTextLine({ id: 2, title: 'Pagar luz', description: '' })).toBe(
        '#2 - Pagar luz'
      )
      expect(notePlainTextLine({ id: 3, title: 'Idea', description: 'bot por voz' })).toBe(
        '#3 - Idea: bot por voz'
      )
    })

    it('keeps the url of a link, after its title when present', () => {
      expect(linkPlainTextLine({ id: 5, url: 'https://a.com', title: 'Docs' })).toBe(
        '#5 - Docs: https://a.com'
      )
      expect(linkPlainTextLine({ id: 6, url: 'https://b.com', title: '' })).toBe(
        '#6 - https://b.com'
      )
    })
  })

  it('describes generated images in singular and plural', () => {
    expect(generatedImagesOmittedText(1, 'openai')).toBe(
      'Se generó 1 imagen con openai, pero no se puede mostrar en este dispositivo.'
    )
    expect(generatedImagesOmittedText(3, 'gemini')).toBe(
      'Se generaron 3 imágenes con gemini, pero no se pueden mostrar en este dispositivo.'
    )
  })
})

describe('normalizePlainText', () => {
  it('removes Slack bold, italic, strike and code marks', () => {
    expect(normalizePlainText('• Id: _#12_ - *Llamar*: ~viejo~ `code` **Nota:** fin')).toBe(
      '• Id: #12 - Llamar: viejo code Nota: fin'
    )
  })

  it('keeps underscores and asterisks that are not formatting', () => {
    expect(normalizePlainText('https://a.com/my_page_x y 5 * 3')).toBe(
      'https://a.com/my_page_x y 5 * 3'
    )
  })

  it('turns Slack links into label and url', () => {
    expect(normalizePlainText('Ver <https://a.com/x_y|Docs> o <https://b.com>')).toBe(
      'Ver Docs: https://a.com/x_y o https://b.com'
    )
  })

  it('removes emojis, including joined and modified ones, keeping accents', () => {
    expect(normalizePlainText('✅ Listo 🤷‍♂️ 👍🏽 canción ñandú 😅')).toBe('Listo canción ñandú')
  })

  it('removes flags and keeps the digit of a keycap', () => {
    expect(normalizePlainText('Hola \u{1F1E6}\u{1F1F7} paso 1\uFE0F\u20E3')).toBe('Hola paso 1')
  })

  it('tidies the spaces and blank lines left behind', () => {
    expect(normalizePlainText('  ❌ Error  al   generar \n\n\n\nfin  ')).toBe(
      'Error al generar\n\nfin'
    )
  })
})

describe('truncatePlainText', () => {
  it('leaves text within the limit untouched', () => {
    expect(truncatePlainText('hola', 10)).toEqual({ text: 'hola', truncated: false })
  })

  it('cuts to the limit including the notice', () => {
    const { text, truncated } = truncatePlainText('a'.repeat(100), 50)

    expect(truncated).toBe(true)
    expect(Array.from(text)).toHaveLength(50)
    expect(text.endsWith(TRUNCATED_NOTICE)).toBe(true)
  })

  it('counts characters, not UTF-16 units', () => {
    expect(truncatePlainText('ñ'.repeat(10), 10)).toEqual({
      text: 'ñ'.repeat(10),
      truncated: false,
    })
  })
})
