import 'express-async-errors'
import express from 'express'
import request from 'supertest'

import AlertsWebController from '../alertsWeb.controller'
import { errorHandler } from '../../../../shared/middleware/errors'

// Real HttpAuth / Permission / validation / errorHandler; only Supabase, the users
// service and the alerts service are doubles.
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

const snoozeAlertByPresetMock = jest.fn()

const buildApp = (): express.Application => {
  const controller = new AlertsWebController({
    snoozeAlertByPreset: snoozeAlertByPresetMock,
  } as any)

  const app = express()
  app.use(express.json())
  app.use('/alerts', [controller.router])
  app.use(errorHandler)
  return app
}

const EXPECTED = '2030-01-01T18:00:00.000Z'
const validBody = { preset: 'snooze_tomorrow_same_time', expected_scheduled_at: EXPECTED }

describe('POST /alerts/:id/snooze', () => {
  const app = buildApp()

  const snooze = (body: any, id: string | number = 12): request.Test =>
    request(app).post(`/alerts/${id}/snooze`).set('Authorization', 'Bearer token').send(body)

  beforeEach(() => {
    jest.clearAllMocks()
    getUserMock.mockResolvedValue({
      data: { user: { id: 'supabase-1', email: 'user@example.com' } },
      error: null,
    })
    getOrCreateUserSupabaseMock.mockResolvedValue({ data: { id: 42, enabled: true, profile: 3 } })
    snoozeAlertByPresetMock.mockResolvedValue({
      status: 'snoozed',
      alertId: 12,
      scheduledAt: new Date('2030-01-02T18:00:00.000Z'),
    })
  })

  it('answers 200 with exactly the alert id and committed date, for the token user', async () => {
    const res = await snooze(validBody)

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ alert_id: 12, scheduled_at: '2030-01-02T18:00:00.000Z' })
    expect(snoozeAlertByPresetMock).toHaveBeenCalledWith(
      12,
      42,
      'snooze_tomorrow_same_time',
      new Date(EXPECTED)
    )
  })

  it.each([
    ['a non-numeric id', validBody, 'abc'],
    ['a hex id', validBody, '0x10'],
    ['an unsafe integer id', validBody, '9007199254740993'],
    ['a missing preset', { expected_scheduled_at: EXPECTED }, 12],
    ['the hidden 09:00 preset', { ...validBody, preset: 'snooze_tomorrow' }, 12],
    [
      'a date with an offset',
      { ...validBody, expected_scheduled_at: '2030-01-01T15:00:00-03:00' },
      12,
    ],
    ['a user_id field', { ...validBody, user_id: 7 }, 12],
  ])('answers 400 INVALID_SNOOZE_REQUEST for %s', async (_case, body, id) => {
    const res = await snooze(body, id)

    expect(res.status).toBe(400)
    expect(res.body.errors[0].context.code).toBe('INVALID_SNOOZE_REQUEST')
    expect(snoozeAlertByPresetMock).not.toHaveBeenCalled()
  })

  it('answers 401 without a token and 403 for a profile without access', async () => {
    const noToken = await request(app).post('/alerts/12/snooze').send(validBody)
    expect(noToken.status).toBe(401)

    getOrCreateUserSupabaseMock.mockResolvedValue({ data: { id: 42, enabled: true, profile: 99 } })
    const forbidden = await snooze(validBody)
    expect(forbidden.status).toBe(403)

    expect(snoozeAlertByPresetMock).not.toHaveBeenCalled()
  })

  it.each([
    ['not_found', 404, 'ALERT_NOT_FOUND'],
    ['schedule_changed', 409, 'ALERT_SCHEDULE_CHANGED'],
  ])('keeps a %s rejection as %i through the auth decorators', async (status, http, code) => {
    snoozeAlertByPresetMock.mockResolvedValue({ status })

    const res = await snooze(validBody)

    expect(res.status).toBe(http)
    expect(res.body.errors[0].context.code).toBe(code)
  })

  it('answers a generic 500 when the operation fails unexpectedly', async () => {
    snoozeAlertByPresetMock.mockRejectedValue(new Error('SQLITE_BUSY: database is locked'))

    const res = await snooze(validBody)

    expect(res.status).toBe(500)
    expect(res.body).toEqual({ errors: [{ message: 'Something went wrong' }] })
  })
})
