import { Constants } from '../../../../entities/constants'
import { GlobalConfigKey } from '../../shared/constants/constants.interfaces'

export default class ConstantsDataSources {
  /**
   * Save user in database
   * @param data IConstants - Data constants
   * @returns
   */
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

  /**
   * Get all constants
   * @returns
   */
  public async getAllConstants(): Promise<Constants[]> {
    try {
      const constants = await Constants.find()

      return constants
    } catch (error) {
      return error
    }
  }

  /**
   * Get constant by key
   * @param key string - Key constant
   * @returns
   */
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

  /**
   * Update constant by key, if constant not exists, create new constant
   * @param key string - Key constant
   * @param value string - Value constant
   * @returns
   */
  public async updateConstantByKey(key: GlobalConfigKey, value: string): Promise<Constants> {
    try {
      const constant = await Constants.findOne({
        where: { key },
      })

      // If constant not exists, create new constant
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
