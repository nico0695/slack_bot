import { singleton } from 'tsyringe'

import { Constants } from '../../../../entities/constants'
import { GlobalConfigKey } from '../../shared/constants/constants.interfaces'

@singleton()
export default class ConstantsDataSources {
  constructor() {}

  public async createConstant(key: GlobalConfigKey, value: string): Promise<Constants> {
    try {
      const newConstant = new Constants()
      newConstant.key = key
      newConstant.value = value

      await newConstant.save()

      return newConstant
    } catch (error) {
      return error
    }
  }

  public async getAllConstants(): Promise<Constants[]> {
    try {
      const constants = await Constants.find()

      return constants
    } catch (error) {
      return error
    }
  }

  public async getConstantByKey(key: GlobalConfigKey): Promise<Constants> {
    try {
      const constant = await Constants.findOne({
        where: { key },
      })

      return constant
    } catch (error) {
      return error
    }
  }

  public async updateConstantByKey(key: GlobalConfigKey, value: string): Promise<Constants> {
    try {
      const constant = await Constants.findOne({
        where: { key },
      })

      if (!constant) {
        const newConstant = new Constants()
        newConstant.key = key
        newConstant.value = value

        await newConstant.save()
        return newConstant
      }

      constant.value = value

      await constant.save()

      return constant
    } catch (error) {
      return error
    }
  }
}
