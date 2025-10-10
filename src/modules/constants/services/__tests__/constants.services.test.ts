import ConstantsServices from '../constants.services'
import { GlobalConfigKey } from '../../shared/constants/constants.interfaces'
import { setGlobalConfigValue } from '../../../../config/globalConfig'

const getAllConstantsMock = jest.fn()
const getConstantByKeyMock = jest.fn()
const updateConstantByKeyMock = jest.fn()
const createConstantMock = jest.fn()

const dataSourceMock = {
  getAllConstants: getAllConstantsMock,
  getConstantByKey: getConstantByKeyMock,
  updateConstantByKey: updateConstantByKeyMock,
  createConstant: createConstantMock,
}

jest.mock('../../repositories/database/constants.dataSource', () => ({
  __esModule: true,
  default: {
    getInstance: () => dataSourceMock,
  },
}))

jest.mock('../../../../config/globalConfig', () => ({
  setGlobalConfigValue: jest.fn(),
}))

describe('ConstantsServices', () => {
  let service: ConstantsServices

  beforeEach(() => {
    jest.clearAllMocks()
    service = ConstantsServices.getInstance()
  })

  it('returns all constants from datasource', async () => {
    const constants = [{ key: 'mode', value: 'on' }]
    getAllConstantsMock.mockResolvedValue(constants)

    const result = await service.getAllConstants()

    expect(getAllConstantsMock).toHaveBeenCalled()
    expect(result).toBe(constants)
  })

  it('retrieves constant by key', async () => {
    const constant = { key: GlobalConfigKey.openiaIsActive, value: 'true' }
    getConstantByKeyMock.mockResolvedValue(constant)

    const result = await service.getConstantByKey(GlobalConfigKey.openiaIsActive)

    expect(getConstantByKeyMock).toHaveBeenCalledWith(GlobalConfigKey.openiaIsActive)
    expect(result).toBe(constant)
  })

  it('updates constant and refreshes global config', async () => {
    const updated = { key: GlobalConfigKey.openiaIsActive, value: 'false' }
    updateConstantByKeyMock.mockResolvedValue(updated)

    const result = await service.updateConstantByKey(
      GlobalConfigKey.openiaIsActive,
      'false'
    )

    expect(updateConstantByKeyMock).toHaveBeenCalledWith(
      GlobalConfigKey.openiaIsActive,
      'false'
    )
    expect(setGlobalConfigValue).toHaveBeenCalledWith(
      GlobalConfigKey.openiaIsActive,
      'false'
    )
    expect(result).toBe(updated)
  })

  it('creates constant and writes to global config cache', async () => {
    const created = { key: GlobalConfigKey.openiaIsActive, value: 'true' }
    createConstantMock.mockResolvedValue(created)

    const result = await service.createConstant(GlobalConfigKey.openiaIsActive, 'true')

    expect(createConstantMock).toHaveBeenCalledWith(GlobalConfigKey.openiaIsActive, 'true')
    expect(setGlobalConfigValue).toHaveBeenCalledWith(
      GlobalConfigKey.openiaIsActive,
      'true'
    )
    expect(result).toBe(created)
  })
})
