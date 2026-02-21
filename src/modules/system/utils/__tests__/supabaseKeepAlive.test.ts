import { supabaseKeepAlive } from '../supabaseKeepAlive'

const fetchMock = jest.fn()
global.fetch = fetchMock

jest.mock('../../../../config/logger', () => ({
  createModuleLogger: jest.fn().mockReturnValue({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    fatal: jest.fn(),
  }),
}))

describe('supabaseKeepAlive', () => {
  const originalEnv = process.env

  beforeEach(() => {
    jest.clearAllMocks()
    process.env = { ...originalEnv, SUPABASE_URL: 'https://test.supabase.co' }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('pings the Supabase health endpoint when SUPABASE_URL is set', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200 })

    await supabaseKeepAlive()

    expect(fetchMock).toHaveBeenCalledWith('https://test.supabase.co/auth/v1/health')
  })

  it('skips the ping when SUPABASE_URL is not configured', async () => {
    delete process.env.SUPABASE_URL

    await supabaseKeepAlive()

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('logs a warning when the health endpoint returns a non-OK status', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 503 })

    await supabaseKeepAlive()

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('logs an error and does not throw when fetch rejects', async () => {
    fetchMock.mockRejectedValue(new Error('network error'))

    await expect(supabaseKeepAlive()).resolves.toBeUndefined()
  })
})
