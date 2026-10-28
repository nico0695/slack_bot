import ConversationsWebController from '../conversationsWeb.controller'
import BadRequestError from '../../../../shared/utils/errors/BadRequestError'

jest.mock('../../../../shared/middleware/auth', () => {
  const identityDecorator = (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ): PropertyDescriptor => descriptor

  return {
    HttpAuth: identityDecorator,
    Permission: () => identityDecorator,
  }
})

const REQUEST_ID = '7d9c2b13-2b56-4c88-9b38-f2d9d987a013'

const processMessageMock = jest.fn()

const completedResult = {
  request_id: REQUEST_ID,
  status: 'completed',
  message: 'Listo',
  content_omitted: false,
  error: null,
}

describe('ConversationsWebController - assistantMessage', () => {
  const originalEnv = { ...process.env }
  let controller: ConversationsWebController
  let res: any

  beforeEach(() => {
    jest.clearAllMocks()
    process.env = { ...originalEnv }
    controller = new ConversationsWebController(
      {} as any,
      {} as any,
      {
        processMessage: processMessageMock,
      } as any
    )
    controller.userData = { id: 42 } as any
    res = { status: jest.fn().mockReturnThis(), send: jest.fn() }
  })

  afterAll(() => {
    process.env = originalEnv
  })

  it('processes the trimmed message for the authenticated user and answers 200', async () => {
    processMessageMock.mockResolvedValue(completedResult)

    await controller.assistantMessage(
      { body: { request_id: REQUEST_ID, message: '  avisame mañana  ' } },
      res
    )

    expect(processMessageMock).toHaveBeenCalledWith(REQUEST_ID, 'avisame mañana', 42)
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.send).toHaveBeenCalledWith(completedResult)
  })

  it('answers 500 with the envelope when the result is unconfirmed', async () => {
    const unknownResult = {
      ...completedResult,
      status: 'unknown',
      message: 'No se pudo confirmar el resultado.',
      error: { code: 'result_unconfirmed' },
    }
    processMessageMock.mockResolvedValue(unknownResult)

    await controller.assistantMessage({ body: { request_id: REQUEST_ID, message: 'hola' } }, res)

    expect(res.status).toHaveBeenCalledWith(500)
    expect(res.send).toHaveBeenCalledWith(unknownResult)
  })

  it.each([
    ['a missing request_id', { message: 'hola' }],
    ['a non-UUID request_id', { request_id: 'abc', message: 'hola' }],
    ['an uppercase request_id', { request_id: REQUEST_ID.toUpperCase(), message: 'hola' }],
    ['a missing message', { request_id: REQUEST_ID }],
    ['a blank message', { request_id: REQUEST_ID, message: '   ' }],
    ['a non-string message', { request_id: REQUEST_ID, message: 123 }],
    ['a message over 2000 characters', { request_id: REQUEST_ID, message: 'a'.repeat(2001) }],
    ['a userId', { request_id: REQUEST_ID, message: 'hola', userId: 7 }],
    ['a channelId', { request_id: REQUEST_ID, message: 'hola', channelId: 'C1' }],
    ['a history', { request_id: REQUEST_ID, message: 'hola', conversation: [] }],
  ])('rejects %s before processing', async (_label, body) => {
    await expect(controller.assistantMessage({ body }, res)).rejects.toThrow(BadRequestError)

    expect(processMessageMock).not.toHaveBeenCalled()
    expect(res.send).not.toHaveBeenCalled()
  })

  it('accepts a message of exactly 2000 characters', async () => {
    processMessageMock.mockResolvedValue(completedResult)

    await controller.assistantMessage(
      { body: { request_id: REQUEST_ID, message: 'a'.repeat(2000) } },
      res
    )

    expect(processMessageMock).toHaveBeenCalledTimes(1)
  })

  it('uses ASSISTANT_REST_MAX_INPUT_CHARS for the input limit', async () => {
    process.env.ASSISTANT_REST_MAX_INPUT_CHARS = '10'

    await expect(
      controller.assistantMessage(
        { body: { request_id: REQUEST_ID, message: 'a'.repeat(11) } },
        res
      )
    ).rejects.toThrow(BadRequestError)
    expect(processMessageMock).not.toHaveBeenCalled()
  })
})
