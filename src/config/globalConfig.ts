import { GlobalConfigKey } from '../modules/constants/shared/constants/constants.interfaces'

type GlobalConfigValue = boolean | string

interface IGlobalConfig {
  [key: string]: GlobalConfigValue
}

// Global Config
const GlobalConfig: IGlobalConfig = {
  [GlobalConfigKey.openiaIsActive]: false,
}

export const getGlobalConfigByKey = (key: GlobalConfigKey): GlobalConfigValue => {
  return GlobalConfig[key]
}

export const setGlobalConfigValue = (key: GlobalConfigKey, value: string): void => {
  GlobalConfig[key] = value === 'true' || value === 'false' ? Boolean(value) : value
}
