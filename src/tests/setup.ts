import 'reflect-metadata'

process.env.NODE_ENV = 'test'
process.env.SLACK_BOT_TOKEN ||= 'xoxb-test'
process.env.SLACK_SIGNING_SECRET ||= 'test-signing-secret'
process.env.APP_TOKEN ||= 'xapp-test'

// Global test cleanup
afterAll(async () => {
  jest.clearAllTimers()

  // If RedisConfig was instantiated during tests, clean it up
  try {
    const { RedisConfig } = await import('../config/redisConfig')
    await RedisConfig.disconnect()
    RedisConfig.reset()
  } catch (error) {}
})
