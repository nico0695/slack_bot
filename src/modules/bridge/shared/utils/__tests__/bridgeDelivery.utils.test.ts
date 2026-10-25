import { classifyWebhookResult, getRetryDelayMs, parseRetryAfterMs } from '../bridgeDelivery.utils'

const now = new Date('2026-10-25T15:00:00.000Z')
const minute = 60 * 1000

describe('bridgeDelivery.utils', () => {
  describe('parseRetryAfterMs', () => {
    it.each([
      [undefined, undefined],
      ['', undefined],
      ['120', 120000],
      [' 5 ', 5000],
      ['Sun, 25 Oct 2026 15:02:00 GMT', 120000],
      ['Sun, 25 Oct 2026 14:00:00 GMT', 0],
      ['soon', undefined],
    ])('parses %p', (value, expected) => {
      expect(parseRetryAfterMs(value, now)).toBe(expected)
    })
  })

  describe('getRetryDelayMs', () => {
    it('backs off 1, 2, 4, 8 and then 15 minutes', () => {
      const delays = [1, 2, 3, 4, 5, 6, 7].map((attempts) => getRetryDelayMs(attempts) / minute)

      expect(delays).toEqual([1, 2, 4, 8, 15, 15, 15])
    })

    it('uses Retry-After capped at 15 minutes', () => {
      expect(getRetryDelayMs(1, 30 * 1000)).toBe(30 * 1000)
      expect(getRetryDelayMs(1, 0)).toBe(0)
      expect(getRetryDelayMs(1, 60 * minute)).toBe(15 * minute)
    })
  })

  describe('classifyWebhookResult', () => {
    it.each([200, 201, 202, 204])('marks %s as delivered', (status) => {
      expect(classifyWebhookResult({ status }, now)).toEqual({
        outcome: 'delivered',
        lastStatusCode: status,
        lastError: null,
      })
    })

    it.each([408, 429, 500, 502, 503])('retries %s', (status) => {
      expect(classifyWebhookResult({ status }, now)).toEqual({
        outcome: 'retry',
        lastStatusCode: status,
        lastError: `http_${status}`,
        retryAfterMs: undefined,
      })
    })

    it('passes Retry-After of retryable responses', () => {
      expect(classifyWebhookResult({ status: 429, retryAfter: '30' }, now).retryAfterMs).toBe(30000)
    })

    it.each([301, 302, 400, 401, 403, 404, 409, 413])('fails %s permanently', (status) => {
      expect(classifyWebhookResult({ status }, now)).toEqual({
        outcome: 'failed',
        lastStatusCode: status,
        lastError: `http_${status}`,
      })
    })

    it.each([
      ['ECONNABORTED', 'timeout'],
      ['ETIMEDOUT', 'timeout'],
      ['ECONNREFUSED', 'network_error'],
      ['ENOTFOUND', 'network_error'],
      ['UNKNOWN', 'network_error'],
    ])('retries request error %s as %s', (errorCode, lastError) => {
      expect(classifyWebhookResult({ errorCode }, now)).toEqual({
        outcome: 'retry',
        lastStatusCode: null,
        lastError,
      })
    })

    it('fails blocked destinations permanently', () => {
      expect(classifyWebhookResult({ errorCode: 'EBLOCKEDDESTINATION' }, now)).toEqual({
        outcome: 'failed',
        lastStatusCode: null,
        lastError: 'blocked_destination',
      })
    })
  })
})
