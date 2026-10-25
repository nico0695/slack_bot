import { singleton } from 'tsyringe'

import { Users } from '../../../../entities/users'
import { IBridgeConfig } from '../../shared/interfaces/bridge.interfaces'

@singleton()
export default class BridgeConfigDataSource {
  /**
   * Get the bridge config of a user, including the secret
   * @param userId number - User id
   * @returns IBridgeConfig or null when the user does not exist
   */
  async getBridgeConfig(userId: number): Promise<IBridgeConfig | null> {
    const user = await Users.findOne({
      select: {
        id: true,
        bridgeBaseUrl: true,
        bridgeWebhookEnabled: true,
        bridgeWebhookSecret: true,
      },
      where: { id: userId },
    })

    if (!user) return null

    return {
      baseUrl: user.bridgeBaseUrl ?? null,
      enabled: Boolean(user.bridgeWebhookEnabled),
      secret: user.bridgeWebhookSecret ?? null,
    }
  }

  /**
   * Replace the bridge config of a user in a single update
   * @param userId number - User id
   * @param config IBridgeConfig - Full config to persist
   */
  async updateBridgeConfig(userId: number, config: IBridgeConfig): Promise<void> {
    await Users.update(userId, {
      bridgeBaseUrl: config.baseUrl,
      bridgeWebhookEnabled: config.enabled,
      bridgeWebhookSecret: config.secret,
    })
  }
}
