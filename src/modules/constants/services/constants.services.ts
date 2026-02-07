import { Constants } from '../../../entities/constants'
import ConstantsDataSources from '../repositories/database/constants.dataSource'

import { setGlobalConfigValue } from '../../../config/globalConfig'
import { GlobalConfigKey } from '../shared/constants/constants.interfaces'
import { createModuleLogger } from '../../../config/logger'

const log = createModuleLogger('constants.service')

export default class ConstantsServices {
  static #instance: ConstantsServices

  #constantsDataSources: ConstantsDataSources

  private constructor() {
    this.#constantsDataSources = ConstantsDataSources.getInstance()
  }

  static getInstance(): ConstantsServices {
    if (this.#instance) {
      return this.#instance
    }

    this.#instance = new ConstantsServices()
    return this.#instance
  }

  getAllConstants = async (): Promise<Constants[]> => {
    const constants = await this.#constantsDataSources.getAllConstants()

    return constants
  }

  getConstantByKey = async (key: GlobalConfigKey): Promise<Constants> => {
    const constant = await this.#constantsDataSources.getConstantByKey(key)

    return constant
  }

  updateConstantByKey = async (key: GlobalConfigKey, value: string): Promise<Constants> => {
    try {
      const constant = await this.#constantsDataSources.updateConstantByKey(key, value)

      setGlobalConfigValue(key, value)

      return constant
    } catch (error) {
      log.error({ err: error, key }, 'updateConstantByKey failed')
      throw error
    }
  }

  createConstant = async (key: GlobalConfigKey, value: string): Promise<Constants> => {
    try {
      const constant = await this.#constantsDataSources.createConstant(key, value)

      setGlobalConfigValue(key, value)

      return constant
    } catch (error) {
      log.error({ err: error, key }, 'createConstant failed')
      throw error
    }
  }
}
