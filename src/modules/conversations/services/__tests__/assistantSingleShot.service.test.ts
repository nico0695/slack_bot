import AssistantSingleShotService from '../assistantSingleShot.service'
import MessageProcessor from '../messageProcessor.service'
import { ConversationProviders } from '../../shared/constants/conversationFlow'
import { roleTypes } from '../../shared/constants/openai'

jest.mock('../../../../config/slackConfig', () => ({
  connectionSlackApp: { client: { chat: { postMessage: jest.fn() } } },
}))

const REQUEST_ID = '7d9c2b13-2b56-4c88-9b38-f2d9d987a013'

const processAssistantMessageMock = jest.fn()

const buildResponse = (fields: Record<string, unknown>): any => ({
  role: roleTypes.assistant,
  provider: ConversationProviders.ASSISTANT,
  ...fields,
})

describe('AssistantSingleShotService', () => {
  const originalEnv = { ...process.env }
  let service: AssistantSingleShotService

  beforeEach(() => {
    jest.clearAllMocks()
    process.env = { ...originalEnv }
    service = new AssistantSingleShotService({
      processAssistantMessage: processAssistantMessageMock,
    } as any)
  })

  afterAll(() => {
    process.env = originalEnv
  })

  it('processes once like a Slack DM: no channel, no channel context, no history', async () => {
    processAssistantMessageMock.mockResolvedValue({
      response: buildResponse({ content: 'Hola' }),
      shouldSkipAI: false,
    })

    await service.processMessage(REQUEST_ID, 'hola', 42)

    expect(processAssistantMessageMock).toHaveBeenCalledTimes(1)
    expect(processAssistantMessageMock).toHaveBeenCalledWith(
      'hola',
      42,
      undefined,
      false,
      undefined
    )
  })

  it('returns the response as a completed result', async () => {
    processAssistantMessageMock.mockResolvedValue({
      response: buildResponse({ content: 'Alerta creada con id: *#12* ✅' }),
      shouldSkipAI: false,
    })

    await expect(service.processMessage(REQUEST_ID, 'avisame', 42)).resolves.toEqual({
      request_id: REQUEST_ID,
      status: 'completed',
      message: 'Alerta creada con id: #12',
      content_omitted: false,
      error: null,
    })
  })

  it('prefers the plain text and keeps its omission flag', async () => {
    processAssistantMessageMock.mockResolvedValue({
      response: buildResponse({
        content: 'data:image/png;base64,abc',
        plainText: 'Se generó el código QR.',
        contentOmitted: true,
      }),
      shouldSkipAI: false,
    })

    const result = await service.processMessage(REQUEST_ID, '.qr hola', 42)

    expect(result.message).toBe('Se generó el código QR.')
    expect(result.content_omitted).toBe(true)
  })

  it('answers a generic completed message when the processor returns null', async () => {
    processAssistantMessageMock.mockResolvedValue({ response: null, shouldSkipAI: false })

    const result = await service.processMessage(REQUEST_ID, 'avisame mañana', 42)

    expect(result).toEqual({
      request_id: REQUEST_ID,
      status: 'completed',
      message: 'No pude entender o completar tu pedido. Probá reformularlo.',
      content_omitted: false,
      error: null,
    })
  })

  it('answers that the message was not processed when it is skipped', async () => {
    processAssistantMessageMock.mockResolvedValue({ response: null, shouldSkipAI: true })

    const result = await service.processMessage(REQUEST_ID, '+ nota', 42)

    expect(result.status).toBe('completed')
    expect(result.message).toBe('Mensaje no procesado.')
  })

  it('does not leave the screen empty when nothing is left to show', async () => {
    processAssistantMessageMock.mockResolvedValue({
      response: buildResponse({ content: '✅ 👍' }),
      shouldSkipAI: false,
    })

    const result = await service.processMessage(REQUEST_ID, 'ok', 42)

    expect(result.message).toBe('La respuesta no tiene contenido para mostrar en este dispositivo.')
    expect(result.content_omitted).toBe(true)
  })

  it('reports an unconfirmed result without the internal error when processing throws', async () => {
    processAssistantMessageMock.mockRejectedValue(new Error('SQLITE_BUSY: database is locked'))

    const result = await service.processMessage(REQUEST_ID, 'avisame', 42)

    expect(result).toEqual({
      request_id: REQUEST_ID,
      status: 'unknown',
      message: 'No se pudo confirmar el resultado.',
      content_omitted: false,
      error: { code: 'result_unconfirmed' },
    })
    expect(processAssistantMessageMock).toHaveBeenCalledTimes(1)
  })

  describe('output limit', () => {
    beforeEach(() => {
      processAssistantMessageMock.mockResolvedValue({
        response: buildResponse({ content: 'a'.repeat(3000) }),
        shouldSkipAI: false,
      })
    })

    it('truncates to 2000 characters by default and flags it', async () => {
      const result = await service.processMessage(REQUEST_ID, 'largo', 42)

      expect(Array.from(result.message)).toHaveLength(2000)
      expect(result.message.endsWith('(respuesta recortada)')).toBe(true)
      expect(result.content_omitted).toBe(true)
    })

    it('uses ASSISTANT_REST_MAX_OUTPUT_CHARS when valid', async () => {
      process.env.ASSISTANT_REST_MAX_OUTPUT_CHARS = '100'

      const result = await service.processMessage(REQUEST_ID, 'largo', 42)

      expect(Array.from(result.message)).toHaveLength(100)
    })

    it('falls back to the default on an invalid value', async () => {
      process.env.ASSISTANT_REST_MAX_OUTPUT_CHARS = 'abc'

      const result = await service.processMessage(REQUEST_ID, 'largo', 42)

      expect(Array.from(result.message)).toHaveLength(2000)
    })
  })

  it('keeps two requests independent', async () => {
    processAssistantMessageMock
      .mockResolvedValueOnce({ response: buildResponse({ content: 'uno' }), shouldSkipAI: false })
      .mockResolvedValueOnce({ response: null, shouldSkipAI: false })

    const first = await service.processMessage(REQUEST_ID, 'uno', 42)
    const second = await service.processMessage('0b7a9d3e-1c2f-4a5b-8c6d-7e8f9a0b1c2d', 'dos', 7)

    expect(first.message).toBe('uno')
    expect(second.request_id).toBe('0b7a9d3e-1c2f-4a5b-8c6d-7e8f9a0b1c2d')
    expect(processAssistantMessageMock).toHaveBeenNthCalledWith(
      2,
      'dos',
      7,
      undefined,
      false,
      undefined
    )
  })

  describe('with the real processor', () => {
    const createAssistantAlertMock = jest.fn()

    const buildRealProcessorService = (): AssistantSingleShotService => {
      const processor = new MessageProcessor(
        { chatCompletion: jest.fn() } as any,
        { createAssistantAlert: createAssistantAlertMock } as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any
      )
      return new AssistantSingleShotService(processor)
    }

    it('creates alerts for the user without channel or request id', async () => {
      createAssistantAlertMock.mockResolvedValue({
        data: { id: 12, message: 'llamar al médico', date: new Date('2999-01-01T13:00:00Z') },
      })

      const result = await buildRealProcessorService().processMessage(
        REQUEST_ID,
        '.a 10m llamar al médico',
        42
      )

      // The command parser keeps a trailing space in the text, as in Slack
      expect(createAssistantAlertMock).toHaveBeenCalledWith(
        42,
        '10m',
        expect.stringMatching(/^llamar al médico\s*$/),
        undefined
      )
      expect(result.status).toBe('completed')
      expect(result.message).toContain('#12')
    })

    it('reports an unconfirmed result when the alert service fails', async () => {
      createAssistantAlertMock.mockResolvedValue({ error: 'Error al crear la alerta' })

      const result = await buildRealProcessorService().processMessage(
        REQUEST_ID,
        '.a 10m llamar al médico',
        42
      )

      expect(result.status).toBe('unknown')
      expect(result.message).toBe('No se pudo confirmar el resultado.')
    })
  })
})
