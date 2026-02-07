/* eslint-disable @typescript-eslint/no-var-requires */
import express from 'express'
import request from 'supertest'

describe('helmetConfig', () => {
  const originalEnv = process.env.NODE_ENV

  afterEach(() => {
    process.env.NODE_ENV = originalEnv
    jest.resetModules()
  })

  it('exports a valid middleware function', () => {
    const { helmetMiddleware } = require('../helmetConfig')

    expect(typeof helmetMiddleware).toBe('function')
  })

  describe('production environment', () => {
    let app: express.Application

    beforeAll(() => {
      process.env.NODE_ENV = 'production'
      jest.resetModules()

      const { helmetMiddleware } = require('../helmetConfig')
      app = express()
      app.use(helmetMiddleware)
      app.get('/test', (_req: express.Request, res: express.Response) => {
        res.json({ ok: true })
      })
    })

    it('sets security headers', async () => {
      const res = await request(app).get('/test')

      expect(res.headers['x-content-type-options']).toBe('nosniff')
      expect(res.headers['x-frame-options']).toBe('DENY')
      expect(res.headers['referrer-policy']).toBe('no-referrer')
      expect(res.headers['cross-origin-resource-policy']).toBe('cross-origin')
      expect(res.headers['x-dns-prefetch-control']).toBe('off')
      expect(res.headers['x-permitted-cross-domain-policies']).toBe('none')
    })

    it('sets Strict-Transport-Security in production', async () => {
      const res = await request(app).get('/test')

      expect(res.headers['strict-transport-security']).toBeDefined()
      expect(res.headers['strict-transport-security']).toContain('max-age=15552000')
    })

    it('removes X-Powered-By header', async () => {
      const res = await request(app).get('/test')

      expect(res.headers['x-powered-by']).toBeUndefined()
    })

    it('does not set Content-Security-Policy', async () => {
      const res = await request(app).get('/test')

      expect(res.headers['content-security-policy']).toBeUndefined()
    })

    it('does not set Cross-Origin-Embedder-Policy', async () => {
      const res = await request(app).get('/test')

      expect(res.headers['cross-origin-embedder-policy']).toBeUndefined()
    })
  })

  describe('development environment', () => {
    it('does not set Strict-Transport-Security', async () => {
      process.env.NODE_ENV = 'development'
      jest.resetModules()

      const { helmetMiddleware } = require('../helmetConfig')
      const app = express()
      app.use(helmetMiddleware)
      app.get('/test', (_req: express.Request, res: express.Response) => {
        res.json({ ok: true })
      })

      const res = await request(app).get('/test')

      expect(res.headers['strict-transport-security']).toBeUndefined()
    })
  })

  describe('custom Content-Type', () => {
    it('does not interfere with audio/mpeg content type', async () => {
      const { helmetMiddleware } = require('../helmetConfig')
      const app = express()
      app.use(helmetMiddleware)
      app.get('/audio', (_req: express.Request, res: express.Response) => {
        res.setHeader('Content-Type', 'audio/mpeg')
        res.send(Buffer.from('fake-audio'))
      })

      const res = await request(app).get('/audio')

      expect(res.headers['content-type']).toContain('audio/mpeg')
      expect(res.headers['x-content-type-options']).toBe('nosniff')
    })
  })
})
