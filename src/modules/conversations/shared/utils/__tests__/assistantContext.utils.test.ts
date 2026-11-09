import {
  ASSISTANT_CONTEXT_MAX_ENTRY_CHARS,
  ASSISTANT_DATA_MAX_CHARS,
} from '../../constants/assistantContext.constants'
import { ConversationProviders } from '../../constants/conversationFlow'
import { roleTypes } from '../../constants/openai'
import { IConversation } from '../../interfaces/converstions'
import {
  DATA_CONTEXT_OMITTED_NOTICE,
  OMITTED_CONTENT_MARKER,
  buildContextEntries,
  buildDataContext,
  formatContextForClassifier,
  toContextText,
} from '../assistantContext.utils'

const len = (text: string): number => Array.from(text).length

const response = (overrides: Partial<IConversation>): IConversation => ({
  role: roleTypes.assistant,
  content: 'contenido',
  provider: ConversationProviders.ASSISTANT,
  ...overrides,
})

const date = (iso: string): Date => new Date(iso)

const alert = (id: number, overrides: Record<string, unknown> = {}): any => ({
  id,
  message: `alerta ${id}`,
  date: date('2026-11-09T17:30:00Z'),
  sent: false,
  createdAt: date('2026-11-01T12:00:00Z'),
  ...overrides,
})

const task = (id: number, overrides: Record<string, unknown> = {}): any => ({
  id,
  title: `tarea ${id}`,
  description: '',
  status: 'pending',
  alertDate: null,
  tag: '',
  createdAt: new Date(Date.UTC(2026, 9, 1, 12, id)),
  ...overrides,
})

const note = (id: number, overrides: Record<string, unknown> = {}): any => ({
  id,
  title: `nota ${id}`,
  description: '',
  tag: '',
  createdAt: new Date(Date.UTC(2026, 9, 1, 12, id)),
  ...overrides,
})

const link = (id: number, overrides: Record<string, unknown> = {}): any => ({
  id,
  url: `https://example.com/${id}`,
  title: '',
  description: '',
  tag: '',
  status: 'unread',
  createdAt: new Date(Date.UTC(2026, 9, 1, 12, id)),
  ...overrides,
})

const empty = { alerts: [], tasks: [], notes: [], links: [] }

const recordLines = (output: string, section: string): string[] => {
  const block = output.split('\n\n').find((part) => part.startsWith(section)) ?? ''
  return block.split('\n').slice(1)
}

describe('toContextText', () => {
  it('trims and keeps short text', () => {
    expect(toContextText('  hola mundo \n')).toBe('hola mundo')
  })

  it('keeps text of exactly the limit untouched', () => {
    const text = '😀'.repeat(ASSISTANT_CONTEXT_MAX_ENTRY_CHARS)

    expect(toContextText(text)).toBe(text)
  })

  it('truncates by code points without splitting emoji', () => {
    const result = toContextText('😀'.repeat(ASSISTANT_CONTEXT_MAX_ENTRY_CHARS + 1))

    expect(len(result)).toBe(ASSISTANT_CONTEXT_MAX_ENTRY_CHARS)
    expect(result).toBe(`${'😀'.repeat(ASSISTANT_CONTEXT_MAX_ENTRY_CHARS - 1)}…`)
    // A split surrogate pair would not survive a UTF-8 round trip
    expect(Buffer.from(result, 'utf8').toString('utf8')).toBe(result)
  })

  it('replaces data URIs', () => {
    const result = toContextText(`mirá data:image/png;base64,${'iVBORw0KGgo'.repeat(5)}== listo`)

    expect(result).toBe(`mirá ${OMITTED_CONTENT_MARKER} listo`)
  })

  it('replaces long base64 runs', () => {
    const result = toContextText(`antes ${'QUJDRA+/'.repeat(40)}== después`)

    expect(result).toBe(`antes ${OMITTED_CONTENT_MARKER} después`)
  })

  it('leaves normal prose untouched', () => {
    const prose =
      'Recordame mañana a las 9 que tengo que llamar al contador y revisar los pendientes. '.repeat(
        10
      )

    expect(toContextText(prose)).toBe(prose.trim())
  })

  it('leaves a normal long URL untouched', () => {
    const url = `https://docs.example.com/workspace/projects/2026/planning-notes/${'section-name/'.repeat(
      15
    )}index.html?utm_source=newsletter&utm_medium=email&ref=abc123DEF456#heading-two`

    expect(url.length).toBeGreaterThan(300)
    expect(toContextText(`ver ${url}`)).toBe(`ver ${url}`)
  })

  it('leaves a long path-style URL made only of base64 characters untouched', () => {
    const url = `https://cdn.example.com/${'a1b2c3d4/'.repeat(30)}file.png`

    expect(toContextText(`mirá ${url} y decime`)).toBe(`mirá ${url} y decime`)
    expect(toContextText(url)).toBe(url)
  })

  it('keeps every URL while removing a blob next to them', () => {
    const first = `http://a.example.com/${'AbCd1234/'.repeat(40)}`
    const second = `https://b.example.com/${'x'.repeat(250)}`
    const blob = 'QUJDRA+/'.repeat(40)

    expect(toContextText(`${first} ${blob} ${second}`)).toBe(
      `${first} ${OMITTED_CONTENT_MARKER} ${second}`
    )
  })

  it('removes a 5000-char raw base64 blob with "/" and "+"', () => {
    const blob = 'aB3/xY9+Zk'.repeat(500)

    expect(blob).toHaveLength(5000)
    expect(toContextText(`antes ${blob} después`)).toBe(`antes ${OMITTED_CONTENT_MARKER} después`)
  })

  it('removes base64url runs', () => {
    const blob = 'aB3-xY9_Zk'.repeat(30)

    expect(toContextText(`token ${blob} fin`)).toBe(`token ${OMITTED_CONTENT_MARKER} fin`)
  })

  it.each([
    ['LF', '\n'],
    ['CRLF', '\r\n'],
  ])('removes MIME-wrapped base64 (76-char lines, %s)', (_name, eol) => {
    const line = 'QUJDRA+/'.repeat(10).slice(0, 76)
    const blob = [line, line, line, 'QUJDRA=='].join(eol)

    expect(line).toHaveLength(76)
    expect(toContextText(`adjunto:\n${blob}\nsaludos`)).toBe(
      `adjunto:\n${OMITTED_CONTENT_MARKER}\nsaludos`
    )
  })

  it('keeps consecutive lines of normal prose', () => {
    const prose = [
      'Primera línea con bastante texto para superar los sesenta caracteres de largo sin problema.',
      'Segunda línea con bastante texto para superar los sesenta caracteres de largo sin problema.',
      'Tercera línea con bastante texto para superar los sesenta caracteres de largo sin problema.',
    ].join('\n')

    expect(toContextText(prose)).toBe(prose)
  })

  it.each([
    ['base64 with url-safe alphabet', `data:image/png;base64,${'iVBOR-_0KGgo'.repeat(5)}`],
    ['percent-encoded without base64', 'data:text/plain;charset=utf-8,hola%20mundo%20secreto'],
    ['plain svg', 'data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22/%3E'],
    ['no media type', 'data:,contenido%20secreto'],
  ])('replaces the payload of any data: URI (%s)', (_name, uri) => {
    expect(toContextText(`mirá ${uri} listo`)).toBe(`mirá ${OMITTED_CONTENT_MARKER} listo`)
  })

  it('keeps a URL that carries a data URI in its query', () => {
    const url = 'https://example.com/preview?src=data:text/plain,hola'

    expect(toContextText(`ver ${url}`)).toBe(`ver ${url}`)
  })

  it('does not treat the word "data:" in prose as a data URI', () => {
    const prose = 'la data: nombre, apellido y metadata:, nada más'

    expect(toContextText(prose)).toBe(prose)
  })
})

describe('buildContextEntries', () => {
  it('returns user and assistant entries', () => {
    expect(buildContextEntries(' hola ', response({ content: ' respuesta ' }))).toEqual([
      { role: 'user', content: 'hola' },
      { role: 'assistant', content: 'respuesta' },
    ])
  })

  it('prefers plainText over content', () => {
    const entries = buildContextEntries('hola', response({ content: 'rico', plainText: 'plano' }))

    expect(entries[1]).toEqual({ role: 'assistant', content: 'plano' })
  })

  it('never uses contentBlock', () => {
    const entries = buildContextEntries(
      'hola',
      response({
        content: 'texto',
        contentBlock: { blocks: [{ type: 'section', text: { text: 'BLOQUE' } }] },
      })
    )

    expect(entries).toEqual([
      { role: 'user', content: 'hola' },
      { role: 'assistant', content: 'texto' },
    ])
    expect(JSON.stringify(entries)).not.toContain('BLOQUE')
    expect(Object.keys(entries[1])).toEqual(['role', 'content'])
  })

  it('sanitizes both sides', () => {
    const entries = buildContextEntries(
      `a ${'QUJDRA+/'.repeat(40)}`,
      response({ content: 'palabra '.repeat(1000) })
    )

    expect(entries[0].content).toBe(`a ${OMITTED_CONTENT_MARKER}`)
    expect(len(entries[1].content)).toBe(ASSISTANT_CONTEXT_MAX_ENTRY_CHARS)
  })

  it('returns [] when either text is empty', () => {
    expect(buildContextEntries('   ', response({ content: 'ok' }))).toEqual([])
    expect(buildContextEntries('hola', response({ content: '  ' }))).toEqual([])
    expect(buildContextEntries('hola', response({ content: 'ok', plainText: '' }))).toEqual([])
  })
})

describe('formatContextForClassifier', () => {
  it('returns an empty string without entries', () => {
    expect(formatContextForClassifier([])).toBe('')
  })

  it('formats one compact line per entry', () => {
    const result = formatContextForClassifier([
      { role: roleTypes.user, content: 'hola\n\n  qué   tal' },
      { role: roleTypes.assistant, content: 'todo\tbien' },
    ])

    expect(result).toBe('U:hola qué tal\nA:todo bien')
  })

  it('truncates each entry by code points', () => {
    const result = formatContextForClassifier(
      [
        { role: roleTypes.user, content: '😀'.repeat(300) },
        { role: roleTypes.assistant, content: 'a'.repeat(10) },
      ],
      10
    )

    const [userLine, assistantLine] = result.split('\n')
    expect(userLine).toBe(`U:${'😀'.repeat(9)}…`)
    expect(assistantLine).toBe(`A:${'a'.repeat(10)}`)
  })

  it('uses 200 chars per entry by default', () => {
    const result = formatContextForClassifier([{ role: roleTypes.user, content: 'a'.repeat(500) }])

    expect(len(result)).toBe(202)
  })
})

describe('buildDataContext', () => {
  it('renders sections in order with their fields', () => {
    const output = buildDataContext({
      alerts: [alert(3, { message: 'Llamar\n al   médico' })],
      tasks: [
        task(12, {
          title: 'Informe',
          description: 'Armar informe',
          tag: 'trabajo',
          status: 'in_progress',
          alertDate: date('2026-11-10T02:59:00Z'),
        }),
      ],
      notes: [note(4, { title: 'Wifi', description: 'clave 1234', tag: 'casa' })],
      links: [link(9, { title: 'Docs', description: 'guía', tag: 'dev', status: 'read' })],
    })

    expect(output).toBe(
      [
        'ALERTAS (1)',
        '- #3 | mensaje: Llamar al médico | estado: pendiente | fecha: 2026-11-09 14:30',
        '',
        'TAREAS (1)',
        '- #12 | título: Informe | descripción: Armar informe | etiqueta: trabajo | estado: in_progress | fecha: 2026-11-09 23:59',
        '',
        'NOTAS (1)',
        '- #4 | título: Wifi | descripción: clave 1234 | etiqueta: casa | fecha: 2026-10-01 09:04',
        '',
        'LINKS (1)',
        '- #9 | título: Docs | descripción: guía | etiqueta: dev | estado: read | fecha: 2026-10-01 09:09 | url: https://example.com/9',
      ].join('\n')
    )
  })

  it('omits empty fields and falls back to createdAt for tasks without alertDate', () => {
    const output = buildDataContext({ ...empty, tasks: [task(1)], links: [link(2)] })

    expect(recordLines(output, 'TAREAS')).toEqual([
      '- #1 | título: tarea 1 | estado: pending | fecha: 2026-10-01 09:01',
    ])
    expect(recordLines(output, 'LINKS')).toEqual([
      '- #2 | estado: unread | fecha: 2026-10-01 09:02 | url: https://example.com/2',
    ])
  })

  it('shows empty sections without a notice', () => {
    const output = buildDataContext(empty)

    expect(output).toBe('ALERTAS (0)\n\nTAREAS (0)\n\nNOTAS (0)\n\nLINKS (0)')
    expect(output).not.toContain('AVISO')
  })

  it('marks unavailable types and adds the notice', () => {
    const output = buildDataContext({ alerts: [], tasks: [task(1)], notes: [], links: null })

    expect(output).toContain('LINKS (no disponible)')
    expect(output).toContain('NOTAS (0)')
    expect(output.endsWith(DATA_CONTEXT_OMITTED_NOTICE)).toBe(true)
    expect(DATA_CONTEXT_OMITTED_NOTICE).toContain('no disponibles')
  })

  it('sorts alerts by date ascending and the rest by createdAt descending', () => {
    const output = buildDataContext({
      alerts: [
        alert(1, { date: date('2026-12-01T12:00:00Z') }),
        alert(2, { date: date('2026-11-10T12:00:00Z') }),
        alert(3, { date: date('2026-11-20T12:00:00Z') }),
      ],
      tasks: [task(1), task(3), task(2)],
      notes: [note(5), note(7), note(6)],
      links: [link(2), link(1), link(3)],
    })

    const ids = (section: string): string[] =>
      recordLines(output, section).map((line) => line.split(' ')[1])

    expect(ids('ALERTAS')).toEqual(['#2', '#3', '#1'])
    expect(ids('TAREAS')).toEqual(['#3', '#2', '#1'])
    expect(ids('NOTAS')).toEqual(['#7', '#6', '#5'])
    expect(ids('LINKS')).toEqual(['#3', '#2', '#1'])
  })

  it('does not mutate the input and is deterministic', () => {
    const tasks = [task(1), task(3), task(2)]
    const data = { ...empty, tasks }

    const first = buildDataContext(data)

    expect(tasks.map((item) => item.id)).toEqual([1, 3, 2])
    expect(buildDataContext(data)).toBe(first)
  })

  it('caps each type at 20 records and reports the total', () => {
    const tasks = Array.from({ length: 37 }, (_, index) => task(index + 1))
    const output = buildDataContext({ ...empty, tasks, notes: [note(1)] })

    expect(output).toContain('TAREAS (mostrando 20 de 37)')
    expect(recordLines(output, 'TAREAS')).toHaveLength(20)
    expect(recordLines(output, 'TAREAS')[0]).toContain('#37 ')
    expect(output).toContain('NOTAS (1)')
    expect(output.endsWith(DATA_CONTEXT_OMITTED_NOTICE)).toBe(true)
  })

  it('honours a custom per-type cap', () => {
    const output = buildDataContext(
      { ...empty, notes: [note(1), note(2), note(3)] },
      { maxItemsPerType: 2 }
    )

    expect(output).toContain('NOTAS (mostrando 2 de 3)')
    expect(recordLines(output, 'NOTAS')).toHaveLength(2)
  })

  it('has no notice when everything fits', () => {
    const output = buildDataContext({
      alerts: [alert(1)],
      tasks: Array.from({ length: 20 }, (_, index) => task(index + 1)),
      notes: [note(1)],
      links: [link(1)],
    })

    expect(output).toContain('TAREAS (20)')
    expect(output).not.toContain('AVISO')
    expect(output).not.toContain('mostrando')
  })

  it('caps long field values', () => {
    const output = buildDataContext({
      ...empty,
      notes: [note(1, { description: '😀'.repeat(900) })],
    })

    expect(output).toContain(`descripción: ${'😀'.repeat(499)}… |`)
  })

  it('adds the notice when a field value is cut', () => {
    const output = buildDataContext({
      ...empty,
      notes: [note(1, { description: 'x'.repeat(501) })],
    })

    expect(output).toContain('NOTAS (1)')
    expect(output).toContain(`descripción: ${'x'.repeat(499)}…`)
    expect(output.endsWith(DATA_CONTEXT_OMITTED_NOTICE)).toBe(true)
    expect(DATA_CONTEXT_OMITTED_NOTICE).toContain('campos recortados')
  })

  it('has no notice for a field of exactly the limit', () => {
    const output = buildDataContext({
      ...empty,
      tasks: [task(1, { description: 'x'.repeat(500) })],
    })

    expect(output).toContain(`descripción: ${'x'.repeat(500)} |`)
    expect(output).not.toContain('AVISO')
  })

  it('shows a long url whole', () => {
    const url = `https://example.com/${'segmento/'.repeat(50)}fin`
    const output = buildDataContext({ ...empty, links: [link(1, { url })] })

    expect(url.length).toBeGreaterThan(400)
    expect(output).toContain(`url: ${url}`)
    expect(output).not.toContain('AVISO')
  })

  it('leaves out an absurdly long url instead of cutting it and adds the notice', () => {
    const url = `https://example.com/${'a'.repeat(600)}`
    const output = buildDataContext({
      ...empty,
      links: [link(1, { url, title: 'link gigante' })],
    })

    expect(output).toContain('- #1 | título: link gigante')
    expect(output).not.toContain('url:')
    expect(output).not.toContain('https://example.com/a')
    expect(output.endsWith(DATA_CONTEXT_OMITTED_NOTICE)).toBe(true)
  })

  it('has no truncation notice when the cut record is not shown', () => {
    const output = buildDataContext(
      {
        ...empty,
        notes: [note(2, { title: 'reciente' }), note(1, { description: 'x'.repeat(900) })],
      },
      { maxItemsPerType: 1 }
    )

    // The notice is there because of the omitted record, the cut one is not rendered
    expect(output).toContain('NOTAS (mostrando 1 de 2)')
    expect(output).not.toContain('…')
  })

  it('stays within a small custom budget dropping whole records', () => {
    const data = {
      alerts: Array.from({ length: 10 }, (_, index) => alert(index + 1)),
      tasks: Array.from({ length: 10 }, (_, index) => task(index + 1)),
      notes: Array.from({ length: 10 }, (_, index) => note(index + 1)),
      links: Array.from({ length: 10 }, (_, index) => link(index + 1)),
    }
    const full = buildDataContext(data)
    const fullLines = new Set(full.split('\n'))

    const output = buildDataContext(data, { maxChars: 700 })

    expect(len(output)).toBeLessThanOrEqual(700)
    expect(output.endsWith(DATA_CONTEXT_OMITTED_NOTICE)).toBe(true)
    // Every record line is complete: it exists verbatim in the unrestricted output
    const records = output.split('\n').filter((line) => line.startsWith('- #'))
    expect(records.length).toBeGreaterThan(0)
    expect(records.length).toBeLessThan(40)
    records.forEach((line) => {
      expect(fullLines.has(line)).toBe(true)
    })
    // Header counts match what is actually shown
    ;['ALERTAS', 'TAREAS', 'NOTAS', 'LINKS'].forEach((section) => {
      const shown = recordLines(output, section).filter((line) => line.startsWith('- #')).length
      expect(output).toContain(`${section} (mostrando ${shown} de 10)`)
    })
  })

  it('stays within the default budget with huge descriptions', () => {
    const huge = 'palabra larguísima '.repeat(400)
    const output = buildDataContext({
      alerts: Array.from({ length: 30 }, (_, index) => alert(index + 1, { message: huge })),
      tasks: Array.from({ length: 30 }, (_, index) =>
        task(index + 1, { title: huge, description: huge })
      ),
      notes: Array.from({ length: 30 }, (_, index) =>
        note(index + 1, { title: huge, description: huge })
      ),
      links: Array.from({ length: 30 }, (_, index) =>
        link(index + 1, { title: huge, description: huge })
      ),
    })

    expect(len(output)).toBeLessThanOrEqual(ASSISTANT_DATA_MAX_CHARS)
    expect(output.endsWith(DATA_CONTEXT_OMITTED_NOTICE)).toBe(true)
    ;['ALERTAS', 'TAREAS', 'NOTAS', 'LINKS'].forEach((section) => {
      const shown = recordLines(output, section).filter((line) => line.startsWith('- #')).length
      expect(shown).toBeGreaterThan(0)
      expect(output).toContain(`${section} (mostrando ${shown} de 30)`)
    })
  })

  it('does not let a type with giant records starve the others', () => {
    const giant = 'x'.repeat(480)
    const output = buildDataContext(
      {
        alerts: [alert(1), alert(2)],
        tasks: Array.from({ length: 20 }, (_, index) =>
          task(index + 1, { title: giant, description: giant, tag: giant })
        ),
        notes: [note(1), note(2)],
        links: [link(1), link(2)],
      },
      { maxChars: 4000 }
    )

    expect(len(output)).toBeLessThanOrEqual(4000)
    expect(output).toContain('ALERTAS (2)')
    expect(output).toContain('NOTAS (2)')
    expect(output).toContain('LINKS (2)')
    const shownTasks = recordLines(output, 'TAREAS').length
    expect(shownTasks).toBeGreaterThan(0)
    expect(shownTasks).toBeLessThan(20)
    expect(output).toContain(`TAREAS (mostrando ${shownTasks} de 20)`)
    expect(output.endsWith(DATA_CONTEXT_OMITTED_NOTICE)).toBe(true)
  })

  it('never exceeds a budget smaller than the headers', () => {
    const data = { ...empty, tasks: [task(1), task(2)] }

    ;[0, 10, 130, 150, 200].forEach((maxChars) => {
      expect(len(buildDataContext(data, { maxChars }))).toBeLessThanOrEqual(maxChars)
    })
  })
})
