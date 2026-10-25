import BridgeWebhookRepository from '../bridgeWebhook.repository'
import { bridgeSafeLookup } from '../../../shared/utils/bridgeUrl.utils'

const secret = 's'.repeat(32)
const payload: any = { version: 1, event_id: 'event-1', type: 'alert.triggered', alert_id: 1 }

describe('BridgeWebhookRepository', () => {
  let repository: BridgeWebhookRepository
  let postMock: jest.Mock

  beforeEach(() => {
    delete process.env.BRIDGE_WEBHOOK_ALLOW_PRIVATE
    repository = new BridgeWebhookRepository()
    postMock = jest.fn()
  })

  it('configures timeout, no redirects, no proxy and the safe lookup', () => {
    const { defaults } = (repository as any).client

    expect(defaults.timeout).toBe(5000)
    expect(defaults.maxRedirects).toBe(0)
    expect(defaults.proxy).toBe(false)
    expect(defaults.validateStatus(503)).toBe(true)
    expect(defaults.httpsAgent.options.lookup).toBe(bridgeSafeLookup)
  })

  it('posts the payload to the webhook path with the user secret', async () => {
    ;(repository as any).client.post = postMock
    postMock.mockResolvedValue({ status: 202, headers: {} })

    const result = await repository.postAlertEvent(
      'https://bridge.example.com/api',
      secret,
      payload
    )

    expect(postMock).toHaveBeenCalledWith(
      'https://bridge.example.com/api/webhooks/alerts',
      payload,
      {
        headers: { 'X-Bridge-Webhook-Secret': secret },
      }
    )
    expect(result).toEqual({ status: 202, retryAfter: undefined })
  })

  it('returns status and Retry-After of non 2xx responses', async () => {
    ;(repository as any).client.post = postMock
    postMock.mockResolvedValue({ status: 429, headers: { 'retry-after': '30' } })

    const result = await repository.postAlertEvent('https://bridge.example.com', secret, payload)

    expect(result).toEqual({ status: 429, retryAfter: '30' })
  })

  it('returns only the error code when the request fails', async () => {
    ;(repository as any).client.post = postMock
    postMock.mockRejectedValue(
      Object.assign(new Error('timeout of 5000ms exceeded'), {
        code: 'ECONNABORTED',
        config: { headers: { 'X-Bridge-Webhook-Secret': secret } },
      })
    )

    const result = await repository.postAlertEvent('https://bridge.example.com', secret, payload)

    expect(result).toEqual({ errorCode: 'ECONNABORTED' })
    expect(JSON.stringify(result)).not.toContain(secret)
  })

  // Real request: the agent lookup blocks it before any connection is attempted
  it('blocks hosts that resolve to private IPs before connecting', async () => {
    const result = await repository.postAlertEvent('https://localhost:9', secret, payload)

    expect(result).toEqual({ errorCode: 'EBLOCKEDDESTINATION' })
  })
})
