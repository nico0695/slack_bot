import ConstantsDataSources from '../constants.dataSource'
import { GlobalConfigKey } from '../../../shared/constants/constants.interfaces'

interface IMockConstant {
  key?: string
  value?: string
  save: jest.Mock
}

const constantsMocks = {
  instances: [] as IMockConstant[],
  find: jest.fn(),
  findOne: jest.fn(),
}

jest.mock('../../../../../entities/constants', () => {
  return {
    Constants: class {
      key?: string
      value?: string
      save: jest.Mock

      constructor() {
        this.save = jest.fn().mockResolvedValue(undefined)
        constantsMocks.instances.push(this)
      }

      static find(...args: any[]): any {
        return constantsMocks.find(...args)
      }

      static findOne(...args: any[]): any {
        return constantsMocks.findOne(...args)
      }
    },
  }
})

describe('ConstantsDataSources', () => {
  let repository: ConstantsDataSources

  beforeEach(() => {
    jest.resetAllMocks()
    constantsMocks.instances.length = 0
    repository = ConstantsDataSources.getInstance()
  })

  it('creates a constant and persists it', async () => {
    const result = await repository.createConstant(
      GlobalConfigKey.openiaIsActive,
      'enabled'
    )

    expect(constantsMocks.instances).toHaveLength(1)
    const instance = constantsMocks.instances[0]
    expect(instance.key).toBe(GlobalConfigKey.openiaIsActive)
    expect(instance.value).toBe('enabled')
    expect(instance.save).toHaveBeenCalled()
    expect(result).toBe(instance)
  })

  it('retrieves all constants', async () => {
    const constants = [{ key: 'mode', value: 'on' }]
    constantsMocks.find.mockResolvedValue(constants)

    const result = await repository.getAllConstants()

    expect(constantsMocks.find).toHaveBeenCalled()
    expect(result).toBe(constants)
  })

  it('returns error when getAllConstants fails', async () => {
    const error = new Error('db offline')
    constantsMocks.find.mockRejectedValue(error)

    const result = await repository.getAllConstants()

    expect(result).toBe(error)
  })

  it('fetches constant by key', async () => {
    const constant = { key: GlobalConfigKey.openiaIsActive, value: 'true' }
    constantsMocks.findOne.mockResolvedValue(constant)

    const result = await repository.getConstantByKey(GlobalConfigKey.openiaIsActive)

    expect(constantsMocks.findOne).toHaveBeenCalledWith({
      where: { key: GlobalConfigKey.openiaIsActive },
    })
    expect(result).toBe(constant)
  })

  it('returns error when getConstantByKey fails', async () => {
    const error = new Error('lookup failed')
    constantsMocks.findOne.mockRejectedValue(error)

    const result = await repository.getConstantByKey(GlobalConfigKey.openiaIsActive)

    expect(result).toBe(error)
  })

  it('updates existing constant when found', async () => {
    const saveMock = jest.fn().mockResolvedValue(undefined)
    const existing = { id: 1, key: GlobalConfigKey.openiaIsActive, value: 'true', save: saveMock }
    constantsMocks.findOne.mockResolvedValue(existing)

    const result = await repository.updateConstantByKey(
      GlobalConfigKey.openiaIsActive,
      'false'
    )

    expect(existing.value).toBe('false')
    expect(saveMock).toHaveBeenCalled()
    expect(result).toBe(existing)
  })

  it('creates constant when updateConstantByKey finds nothing', async () => {
    constantsMocks.findOne.mockResolvedValue(null)

    const result = await repository.updateConstantByKey(
      GlobalConfigKey.openiaIsActive,
      'false'
    )

    expect(constantsMocks.instances).toHaveLength(1)
    const instance = constantsMocks.instances[0]
    expect(instance.key).toBe(GlobalConfigKey.openiaIsActive)
    expect(instance.value).toBe('false')
    expect(instance.save).toHaveBeenCalled()
    expect(result).toBe(instance)
  })

  it('returns error when updateConstantByKey fails', async () => {
    const error = new Error('update failed')
    constantsMocks.findOne.mockRejectedValue(error)

    const result = await repository.updateConstantByKey(
      GlobalConfigKey.openiaIsActive,
      'false'
    )

    expect(result).toBe(error)
  })
})
