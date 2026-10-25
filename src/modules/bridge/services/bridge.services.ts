import { singleton } from 'tsyringe'

import { GenericResponse } from '../../../shared/interfaces/services'
import { createModuleLogger } from '../../../config/logger'

import BridgeConfigDataSource from '../repositories/database/bridgeConfig.dataSource'
import {
  IBridgeConfig,
  IBridgeConfigResponse,
  IBridgeConfigUpdate,
} from '../shared/interfaces/bridge.interfaces'

const log = createModuleLogger('bridge.service')

@singleton()
export default class BridgeServices {
  constructor(private bridgeConfigDataSource: BridgeConfigDataSource) {}

  private toConfigResponse(config: IBridgeConfig): IBridgeConfigResponse {
    return {
      baseUrl: config.baseUrl,
      enabled: config.enabled,
      secretConfigured: Boolean(config.secret),
    }
  }

  /**
   * Merge a partial update into the current config.
   * Omitted fields keep their value, null clears them. Setting a URL enables the
   * webhook unless `enabled` is sent, and clearing the URL or secret disables it.
   */
  private mergeConfig(current: IBridgeConfig, data: IBridgeConfigUpdate): IBridgeConfig {
    const baseUrl = data.baseUrl !== undefined ? data.baseUrl : current.baseUrl
    const secret = data.secret !== undefined ? data.secret : current.secret

    let enabled = current.enabled

    if (data.enabled !== undefined) {
      enabled = data.enabled
    } else if (data.baseUrl === null || data.secret === null) {
      enabled = false
    } else if (data.baseUrl) {
      enabled = true
    }

    return { baseUrl, secret, enabled }
  }

  public async getConfig(userId: number): Promise<GenericResponse<IBridgeConfigResponse>> {
    try {
      const config = await this.bridgeConfigDataSource.getBridgeConfig(userId)

      if (!config) {
        return { error: 'Usuario no encontrado' }
      }

      return { data: this.toConfigResponse(config) }
    } catch (error) {
      log.error({ err: error, userId }, 'getConfig failed')
      return { error: 'Error al obtener la configuración del bridge' }
    }
  }

  public async updateConfig(
    userId: number,
    data: IBridgeConfigUpdate
  ): Promise<GenericResponse<IBridgeConfigResponse>> {
    try {
      const current = await this.bridgeConfigDataSource.getBridgeConfig(userId)

      if (!current) {
        return { error: 'Usuario no encontrado' }
      }

      const config = this.mergeConfig(current, data)

      if (config.enabled && (!config.baseUrl || !config.secret)) {
        return { error: 'Para habilitar el webhook se requieren baseUrl y secret' }
      }

      await this.bridgeConfigDataSource.updateBridgeConfig(userId, config)

      log.info({ userId, enabled: config.enabled }, 'Bridge config updated')

      return { data: this.toConfigResponse(config) }
    } catch (error) {
      log.error({ err: error, userId }, 'updateConfig failed')
      return { error: 'Error al actualizar la configuración del bridge' }
    }
  }
}
