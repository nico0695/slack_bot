import { bridgeDeliveryCronJob } from '../cronJob'

const processPendingDeliveriesMock = jest.fn()

jest.mock('../../services/bridge.services', () => ({
  __esModule: true,
  default: class MockBridgeServices {},
}))

jest.mock('tsyringe', () => ({
  container: {
    resolve: jest.fn().mockReturnValue({
      processPendingDeliveries: (...args: any[]) => processPendingDeliveriesMock(...args),
    }),
  },
  singleton: () => (cls: any) => cls,
}))

jest.mock('../../../../config/logger', () => ({
  createModuleLogger: jest.fn().mockReturnValue({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    fatal: jest.fn(),
  }),
}))

describe('bridgeDeliveryCronJob', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('processes pending deliveries with the current date', async () => {
    processPendingDeliveriesMock.mockResolvedValue({ data: { delivered: 1 } })

    await bridgeDeliveryCronJob()

    expect(processPendingDeliveriesMock).toHaveBeenCalledWith(expect.any(Date))
  })

  it('does not throw when processing fails', async () => {
    processPendingDeliveriesMock.mockRejectedValue(new Error('boom'))

    await expect(bridgeDeliveryCronJob()).resolves.toBeUndefined()
  })

  it('skips a tick while the previous run is still in progress', async () => {
    let releaseFirstRun: (value: any) => void
    processPendingDeliveriesMock.mockReturnValueOnce(
      new Promise((resolve) => {
        releaseFirstRun = resolve
      })
    )

    const firstRun = bridgeDeliveryCronJob()
    await bridgeDeliveryCronJob()

    expect(processPendingDeliveriesMock).toHaveBeenCalledTimes(1)

    releaseFirstRun({ data: {} })
    await firstRun

    processPendingDeliveriesMock.mockResolvedValue({ data: {} })
    await bridgeDeliveryCronJob()

    expect(processPendingDeliveriesMock).toHaveBeenCalledTimes(2)
  })
})
