import 'express-async-errors'
import express from 'express'
import request from 'supertest'

import ConversationsWebController from '../conversationsWeb.controller'
import { errorHandler } from '../../../../shared/middleware/errors'

// Real HttpAuth / Permission / validation / errorHandler; only Supabase, the users
// service and the single-shot service are doubles.
const getUserMock = jest.fn()
const getOrCreateUserSupabaseMock = jest.fn()

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ auth: { getUser: (token: string) => getUserMock(token) } }),
}))

jest.mock('../../../users/services/users.services', () => ({
  __esModule: true,
  default: class UsersServicesDouble {
    getOrCreateUserSupabase = (data: any): any => getOrCreateUserSupabaseMock(data)
  },
}))

const REQUEST_ID = '7d9c2b13-2b56-4c88-9b38-f2d9d987a013'
const TOKEN = 'user-session-token'

const processMessageMock = jest.fn()

const buildApp = (): express.Application => {
  const controller = new ConversationsWebController(
    {} as any,
    {} as any,
    {
      processMessage: processMessageMock,
    } as any
  )

  const app = express()
  app.use(express.json())
  app.use('/conversations', [controller.router])
  app.use(errorHandler)
  return app
}

const validBody = { request_id: REQUEST_ID, message: 'avisame mañana a las diez' }

describe('POST /conversations/assistant', () => {
  const app = buildApp()

  beforeEach(() => {
    jest.clearAllMocks()
    getUserMock.mockResolvedValue({
      data: { user: { id: 'supabase-1', email: 'user@example.com' } },
      error: null,
    })
    getOrCreateUserSupabaseMock.mockResolvedValue({ data: { id: 42, enabled: true, profile: 3 } })
    processMessageMock.mockResolvedValue({
      request_id: REQUEST_ID,
      status: 'completed',
      message: 'Listo',
      content_omitted: false,
      error: null,
    })
  })

  it('answers 200 with the envelope for the user resolved from the token', async () => {
    const res = await request(app)
      .post('/conversations/assistant')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send(validBody)

    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      request_id: REQUEST_ID,
      status: 'completed',
      message: 'Listo',
      content_omitted: false,
      error: null,
    })
    expect(getUserMock).toHaveBeenCalledWith(TOKEN)
    expect(processMessageMock).toHaveBeenCalledWith(REQUEST_ID, validBody.message, 42)
  })

  it('answers 500 with the envelope when the result is unconfirmed', async () => {
    processMessageMock.mockResolvedValue({
      request_id: REQUEST_ID,
      status: 'unknown',
      message: 'No se pudo confirmar el resultado.',
      content_omitted: false,
      error: { code: 'result_unconfirmed' },
    })

    const res = await request(app)
      .post('/conversations/assistant')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send(validBody)

    expect(res.status).toBe(500)
    expect(res.body.status).toBe('unknown')
    expect(res.body.error).toEqual({ code: 'result_unconfirmed' })
  })

  describe('rejected before processing', () => {
    afterEach(() => {
      expect(processMessageMock).not.toHaveBeenCalled()
    })

    it('answers 401 without a token', async () => {
      const res = await request(app).post('/conversations/assistant').send(validBody)

      expect(res.status).toBe(401)
      expect(res.body).toEqual({ errors: [{ message: 'Unauthorized', context: {} }] })
    })

    it('answers 401 with an invalid token', async () => {
      getUserMock.mockResolvedValue({ data: { user: null }, error: { message: 'invalid' } })

      const res = await request(app)
        .post('/conversations/assistant')
        .set('Authorization', 'Bearer bad')
        .send(validBody)

      expect(res.status).toBe(401)
    })

    it('answers 401 for a disabled user', async () => {
      getOrCreateUserSupabaseMock.mockResolvedValue({
        data: { id: 42, enabled: false, profile: 3 },
      })

      const res = await request(app)
        .post('/conversations/assistant')
        .set('Authorization', `Bearer ${TOKEN}`)
        .send(validBody)

      expect(res.status).toBe(401)
    })

    it('answers 403 for a profile without access', async () => {
      getOrCreateUserSupabaseMock.mockResolvedValue({
        data: { id: 42, enabled: true, profile: null },
      })

      const res = await request(app)
        .post('/conversations/assistant')
        .set('Authorization', `Bearer ${TOKEN}`)
        .send(validBody)

      expect(res.status).toBe(403)
      expect(res.body).toEqual({ message: 'You dont have permissions' })
    })

    it('answers 400 with the invalid fields, without echoing the message', async () => {
      const res = await request(app)
        .post('/conversations/assistant')
        .set('Authorization', `Bearer ${TOKEN}`)
        .send({ request_id: 'ABC', message: 'texto privado', userId: 7 })

      expect(res.status).toBe(400)
      expect(res.body.errors[0].message).toBe('Datos de entrada no válidos')
      expect(JSON.stringify(res.body)).not.toContain('texto privado')
    })

    it('answers 400 to a malformed JSON body', async () => {
      const res = await request(app)
        .post('/conversations/assistant')
        .set('Authorization', `Bearer ${TOKEN}`)
        .set('Content-Type', 'application/json')
        .send('{"request_id":')

      expect(res.status).toBe(400)
      expect(res.body).toEqual({ errors: [{ message: 'Cuerpo JSON inválido' }] })
    })
  })
})
