process.env.NODE_ENV = 'test'

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
