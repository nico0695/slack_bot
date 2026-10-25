import { DataSource } from 'typeorm'

import { Users } from '../../../../../entities/users'
import BridgeConfigDataSource from '../bridgeConfig.dataSource'

// Integration test against an in-memory SQLite database
describe('BridgeConfigDataSource', () => {
  let dataSource: DataSource
  let bridgeConfigDataSource: BridgeConfigDataSource
  let userId: number

  const secret = 's'.repeat(32)

  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'sqlite',
      database: ':memory:',
      entities: [Users],
      synchronize: true,
    })
    await dataSource.initialize()
  })

  afterAll(async () => {
    await dataSource.destroy()
  })

  beforeEach(async () => {
    await Users.clear()

    const user = new Users()
    user.name = 'Nick'
    user.phone = ''
    user.email = 'nick@example.com'
    await user.save()

    userId = user.id
    bridgeConfigDataSource = new BridgeConfigDataSource()
  })

  it('returns a disabled empty config for new users', async () => {
    const config = await bridgeConfigDataSource.getBridgeConfig(userId)

    expect(config).toEqual({ baseUrl: null, enabled: false, secret: null })
  })

  it('returns null when the user does not exist', async () => {
    const config = await bridgeConfigDataSource.getBridgeConfig(userId + 100)

    expect(config).toBeNull()
  })

  it('persists the full config and reads the secret explicitly', async () => {
    const baseUrl = 'https://bridge.example.com/api'

    await bridgeConfigDataSource.updateBridgeConfig(userId, { baseUrl, enabled: true, secret })

    const config = await bridgeConfigDataSource.getBridgeConfig(userId)

    expect(config).toEqual({ baseUrl, enabled: true, secret })
  })

  it('never loads the secret in regular user queries', async () => {
    await bridgeConfigDataSource.updateBridgeConfig(userId, {
      baseUrl: 'https://bridge.example.com',
      enabled: true,
      secret,
    })

    const user = await Users.findOne({ where: { id: userId } })
    const users = await Users.find()

    expect(user.bridgeBaseUrl).toBe('https://bridge.example.com')
    expect(user.bridgeWebhookEnabled).toBe(true)
    expect(user).not.toHaveProperty('bridgeWebhookSecret')
    expect(JSON.stringify(user)).not.toContain(secret)
    expect(JSON.stringify(users)).not.toContain(secret)
  })
})
