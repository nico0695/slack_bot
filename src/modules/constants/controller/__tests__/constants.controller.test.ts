import ConstantsController from '../constants.controller'

const getAllConstantsMock = jest.fn()
const getConstantByKeyMock = jest.fn()
const updateConstantByKeyMock = jest.fn()
const createConstantMock = jest.fn()

const serviceMock = {
  getAllConstants: getAllConstantsMock,
  getConstantByKey: getConstantByKeyMock,
  updateConstantByKey: updateConstantByKeyMock,
  createConstant: createConstantMock,
}

jest.mock('../../services/constants.services', () => ({
  __esModule: true,
  default: {
    getInstance: () => serviceMock,
  },
}))

describe('ConstantsController', () => {
  let controller: ConstantsController
  let res: any

  beforeEach(() => {
    jest.clearAllMocks()
    controller = ConstantsController.getInstance()
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    }
  })

  describe('getAllConstants', () => {
    it('returns constants when service resolves', async () => {
      const expected = [{ key: 'a', value: '1' }]
      getAllConstantsMock.mockResolvedValue(expected)

      await controller.getAllConstants({}, res)

      expect(getAllConstantsMock).toHaveBeenCalled()
      expect(res.status).toHaveBeenCalledWith(200)
      expect(res.json).toHaveBeenCalledWith(expected)
    })

    it('returns status 500 when service throws', async () => {
      const error = new Error('boom')
      getAllConstantsMock.mockRejectedValue(error)

      await controller.getAllConstants({}, res)

      expect(res.status).toHaveBeenCalledWith(500)
      expect(res.json).toHaveBeenCalledWith(error)
    })
  })

  describe('getConstantByKey', () => {
    it('returns constant when found', async () => {
      const constant = { key: 'mode', value: 'on' }
      getConstantByKeyMock.mockResolvedValue(constant)

      await controller.getConstantByKey({ params: { key: 'mode' } }, res)

      expect(getConstantByKeyMock).toHaveBeenCalledWith('mode')
      expect(res.status).toHaveBeenCalledWith(200)
      expect(res.json).toHaveBeenCalledWith(constant)
    })

    it('returns status 500 when service throws', async () => {
      const error = new Error('not found')
      getConstantByKeyMock.mockRejectedValue(error)

      await controller.getConstantByKey({ params: { key: 'mode' } }, res)

      expect(res.status).toHaveBeenCalledWith(500)
      expect(res.json).toHaveBeenCalledWith(error)
    })
  })

  describe('updateConstantByKey', () => {
    it('updates constant using service', async () => {
      const updated = { key: 'mode', value: 'off' }
      updateConstantByKeyMock.mockResolvedValue(updated)

      await controller.updateConstantByKey(
        { params: { key: 'mode' }, body: { value: 'off' } },
        res
      )

      expect(updateConstantByKeyMock).toHaveBeenCalledWith('mode', 'off')
      expect(res.status).toHaveBeenCalledWith(200)
      expect(res.json).toHaveBeenCalledWith(updated)
    })

    it('returns status 500 when service rejects', async () => {
      const error = new Error('fail')
      updateConstantByKeyMock.mockRejectedValue(error)

      await controller.updateConstantByKey(
        { params: { key: 'mode' }, body: { value: 'off' } },
        res
      )

      expect(res.status).toHaveBeenCalledWith(500)
      expect(res.json).toHaveBeenCalledWith(error)
    })
  })

  describe('createConstant', () => {
    it('creates constant via service', async () => {
      const created = { key: 'mode', value: 'on' }
      createConstantMock.mockResolvedValue(created)

      await controller.createConstant({ body: created }, res)

      expect(createConstantMock).toHaveBeenCalledWith('mode', 'on')
      expect(res.status).toHaveBeenCalledWith(200)
      expect(res.json).toHaveBeenCalledWith(created)
    })

    it('returns status 500 when service throws', async () => {
      const error = new Error('db down')
      createConstantMock.mockRejectedValue(error)

      await controller.createConstant({ body: { key: 'mode', value: 'on' } }, res)

      expect(res.status).toHaveBeenCalledWith(500)
      expect(res.json).toHaveBeenCalledWith(error)
    })
  })
})
