import { UsersRedis } from '../users.redis'

const redisGetMock = jest.fn()
const redisSetMock = jest.fn()

jest.mock('../../../../../config/redisConfig', () => ({
  RedisConfig: {
    getClient: () => ({
      get: (...args: any[]) => redisGetMock(...args),
      set: (...args: any[]) => redisSetMock(...args),
    }),
  },
}))

describe('UsersRedis', () => {
  let usersRedis: UsersRedis
  let consoleSpy: jest.SpyInstance

  beforeEach(() => {
    jest.clearAllMocks()
    usersRedis = UsersRedis.getInstance()
    consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleSpy.mockRestore()
  })

  it('adds or updates subscription', async () => {
    redisGetMock.mockResolvedValueOnce('{}')
    redisSetMock.mockResolvedValueOnce(undefined)

    const result = await usersRedis.addOrUpdateUserSubscription(1, { endpoint: 'foo' } as any)

    expect(redisGetMock).toHaveBeenCalled()
    expect(redisSetMock).toHaveBeenCalledWith(
      'users-push-subscriptions',
      JSON.stringify({ 1: { endpoint: 'foo' } })
    )
    expect(result).toBe(true)
  })

  it('returns false when redis throws', async () => {
    const error = new Error('fail')
    redisGetMock.mockRejectedValueOnce(error)

    const result = await usersRedis.addOrUpdateUserSubscription(1, { endpoint: 'foo' } as any)

    expect(result).toBe(false)
  })

  it('retrieves subscriptions from redis', async () => {
    redisGetMock.mockResolvedValueOnce('{"1":{"endpoint":"foo"}}')

    const result = await usersRedis.getUsersSubscriptions()

    expect(result).toEqual({ 1: { endpoint: 'foo' } })
  })

  it('returns null when failing to parse subscriptions', async () => {
    const error = new Error('fail')
    redisGetMock.mockRejectedValueOnce(error)

    const result = await usersRedis.getUsersSubscriptions()

    expect(result).toBeNull()
  })
})
