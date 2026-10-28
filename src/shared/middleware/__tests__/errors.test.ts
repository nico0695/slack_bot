import express from 'express'
import request from 'supertest'

import { errorHandler } from '../errors'
import BadRequestError from '../../utils/errors/BadRequestError'

const buildApp = (): express.Application => {
  const app = express()
  app.use(express.json())

  app.post('/echo', (req: express.Request, res: express.Response) => {
    res.json(req.body)
  })
  app.get('/custom-error', () => {
    throw new BadRequestError({ message: 'Datos inválidos' })
  })
  app.get('/unhandled-error', () => {
    throw new Error('internal detail')
  })

  app.use(errorHandler)
  return app
}

describe('errorHandler', () => {
  const app = buildApp()

  it('responds 400 to a malformed JSON body without echoing it', async () => {
    const res = await request(app)
      .post('/echo')
      .set('Content-Type', 'application/json')
      .send('{"message": "secret text",')

    expect(res.status).toBe(400)
    expect(res.body).toEqual({ errors: [{ message: 'Cuerpo JSON inválido' }] })
    expect(JSON.stringify(res.body)).not.toContain('secret text')
  })

  it('responds 413 to a body over the parser limit', async () => {
    const res = await request(app)
      .post('/echo')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ message: 'a'.repeat(200 * 1024) }))

    expect(res.status).toBe(413)
    expect(res.body).toEqual({
      errors: [{ message: 'El cuerpo de la solicitud es demasiado grande' }],
    })
  })

  it('keeps valid JSON bodies working', async () => {
    const res = await request(app).post('/echo').send({ message: 'hola' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ message: 'hola' })
  })

  it('keeps the status and errors of custom errors', async () => {
    const res = await request(app).get('/custom-error')

    expect(res.status).toBe(400)
    expect(res.body).toEqual({ errors: [{ message: 'Datos inválidos', context: {} }] })
  })

  it('keeps responding 500 to unhandled errors without internal details', async () => {
    const res = await request(app).get('/unhandled-error')

    expect(res.status).toBe(500)
    expect(res.body).toEqual({ errors: [{ message: 'Something went wrong' }] })
  })
})
