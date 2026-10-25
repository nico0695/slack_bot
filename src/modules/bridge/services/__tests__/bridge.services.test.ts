import BridgeServices from '../bridge.services'

jest.mock('../../../../config/logger', () => ({
  createModuleLogger: jest.fn().mockReturnValue({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    fatal: jest.fn(),
  }),
}))

const getBridgeConfigMock = jest.fn()
const updateBridgeConfigMock = jest.fn()

const bridgeConfigDataSourceMock = {
  getBridgeConfig: getBridgeConfigMock,
  updateBridgeConfig: updateBridgeConfigMock,
}

const insertDeliveryIfAbsentMock = jest.fn()

const bridgeDeliveriesDataSourceMock = {
  insertDeliveryIfAbsent: insertDeliveryIfAbsentMock,
}

const secret = 's'.repeat(32)
const baseUrl = 'https://bridge.example.com'

const emptyConfig = { baseUrl: null, enabled: false, secret: null }
const fullConfig = { baseUrl, enabled: true, secret }

describe('BridgeServices', () => {
  let services: BridgeServices

  beforeEach(() => {
    jest.clearAllMocks()
    services = new BridgeServices(
      bridgeConfigDataSourceMock as any,
      bridgeDeliveriesDataSourceMock as any
    )
  })

  describe('getConfig', () => {
    it('returns the config without the secret', async () => {
      getBridgeConfigMock.mockResolvedValue(fullConfig)

      const result = await services.getConfig(7)

      expect(getBridgeConfigMock).toHaveBeenCalledWith(7)
      expect(result).toEqual({ data: { baseUrl, enabled: true, secretConfigured: true } })
      expect(JSON.stringify(result)).not.toContain(secret)
    })

    it('returns error when the user does not exist', async () => {
      getBridgeConfigMock.mockResolvedValue(null)

      const result = await services.getConfig(7)

      expect(result).toEqual({ error: 'Usuario no encontrado' })
    })

    it('returns error when the data source fails', async () => {
      getBridgeConfigMock.mockRejectedValue(new Error('db'))

      const result = await services.getConfig(7)

      expect(result.error).toBe('Error al obtener la configuración del bridge')
    })
  })

  describe('updateConfig', () => {
    it('enables the webhook by default when a URL is set', async () => {
      getBridgeConfigMock.mockResolvedValue(emptyConfig)

      const result = await services.updateConfig(7, { baseUrl, secret })

      expect(updateBridgeConfigMock).toHaveBeenCalledWith(7, { baseUrl, secret, enabled: true })
      expect(result).toEqual({ data: { baseUrl, enabled: true, secretConfigured: true } })
      expect(JSON.stringify(result)).not.toContain(secret)
    })

    it('respects an explicit enabled false when setting a URL', async () => {
      getBridgeConfigMock.mockResolvedValue(emptyConfig)

      await services.updateConfig(7, { baseUrl, secret, enabled: false })

      expect(updateBridgeConfigMock).toHaveBeenCalledWith(7, { baseUrl, secret, enabled: false })
    })

    it('keeps omitted fields', async () => {
      getBridgeConfigMock.mockResolvedValue(fullConfig)

      await services.updateConfig(7, { enabled: false })

      expect(updateBridgeConfigMock).toHaveBeenCalledWith(7, { baseUrl, secret, enabled: false })
    })

    it('rotates the secret keeping URL and enabled state', async () => {
      getBridgeConfigMock.mockResolvedValue(fullConfig)
      const newSecret = 'n'.repeat(40)

      await services.updateConfig(7, { secret: newSecret })

      expect(updateBridgeConfigMock).toHaveBeenCalledWith(7, {
        baseUrl,
        secret: newSecret,
        enabled: true,
      })
    })

    it.each([[{ baseUrl: null }], [{ secret: null }]])(
      'disables the webhook when clearing %j',
      async (data) => {
        getBridgeConfigMock.mockResolvedValue(fullConfig)

        await services.updateConfig(7, data)

        expect(updateBridgeConfigMock).toHaveBeenCalledWith(
          7,
          expect.objectContaining({ ...data, enabled: false })
        )
      }
    )

    it.each([
      ['without secret', emptyConfig, { baseUrl }],
      ['without URL', emptyConfig, { secret, enabled: true }],
      ['clearing the URL', fullConfig, { baseUrl: null, enabled: true }],
      ['with nothing configured', emptyConfig, { enabled: true }],
    ])('rejects enabling %s without writing', async (_, current, data) => {
      getBridgeConfigMock.mockResolvedValue(current)

      const result = await services.updateConfig(7, data)

      expect(result).toEqual({ error: 'Para habilitar el webhook se requieren baseUrl y secret' })
      expect(updateBridgeConfigMock).not.toHaveBeenCalled()
    })

    it('returns error when the user does not exist', async () => {
      getBridgeConfigMock.mockResolvedValue(null)

      const result = await services.updateConfig(7, { enabled: false })

      expect(result).toEqual({ error: 'Usuario no encontrado' })
      expect(updateBridgeConfigMock).not.toHaveBeenCalled()
    })

    it('returns error when the update fails', async () => {
      getBridgeConfigMock.mockResolvedValue(emptyConfig)
      updateBridgeConfigMock.mockRejectedValue(new Error('db'))

      const result = await services.updateConfig(7, { baseUrl, secret })

      expect(result).toEqual({ error: 'Error al actualizar la configuración del bridge' })
    })
  })

  describe('enqueueAlertEvent', () => {
    const triggeredAt = new Date('2026-10-25T15:10:42.000Z')
    const alert = {
      id: 123,
      message: 'Alerta de prueba desde ESP32',
      date: new Date('2026-10-25T15:10:00.000Z'),
      requestId: 'req-1',
      deviceId: 'esp32-02',
      user: { id: 7, bridgeBaseUrl: baseUrl, bridgeWebhookEnabled: true },
    }

    it('enqueues the event with the contract payload', async () => {
      const result = await services.enqueueAlertEvent(alert, triggeredAt)

      expect(result).toEqual({ data: true })
      expect(insertDeliveryIfAbsentMock).toHaveBeenCalledTimes(1)

      const delivery = insertDeliveryIfAbsentMock.mock.calls[0][0]
      expect(delivery).toEqual({
        eventId: expect.stringMatching(/^[0-9a-f-]{36}$/),
        alertId: 123,
        userId: 7,
        occurrenceAt: alert.date,
        nextAttemptAt: triggeredAt,
        payload: {
          version: 1,
          event_id: delivery.eventId,
          type: 'alert.triggered',
          alert_id: 123,
          scheduled_at: '2026-10-25T15:10:00.000Z',
          triggered_at: '2026-10-25T15:10:42.000Z',
          message: 'Alerta de prueba desde ESP32',
          request_id: 'req-1',
          device_id: 'esp32-02',
        },
      })
    })

    it('omits request_id and device_id for alerts created on other platforms', async () => {
      await services.enqueueAlertEvent(
        { ...alert, requestId: null, deviceId: undefined },
        triggeredAt
      )

      const { payload } = insertDeliveryIfAbsentMock.mock.calls[0][0]
      expect(payload).not.toHaveProperty('request_id')
      expect(payload).not.toHaveProperty('device_id')
    })

    it.each([
      ['disabled', { bridgeBaseUrl: baseUrl, bridgeWebhookEnabled: false }],
      ['without URL', { bridgeBaseUrl: null, bridgeWebhookEnabled: true }],
      ['not configured', {}],
    ])('does nothing when the bridge is %s', async (_, bridgeUser) => {
      const result = await services.enqueueAlertEvent(
        { ...alert, user: { id: 7, ...bridgeUser } },
        triggeredAt
      )

      expect(result).toEqual({ data: false })
      expect(insertDeliveryIfAbsentMock).not.toHaveBeenCalled()
    })

    it('returns error when the insert fails', async () => {
      insertDeliveryIfAbsentMock.mockRejectedValue(new Error('db'))

      const result = await services.enqueueAlertEvent(alert, triggeredAt)

      expect(result).toEqual({ error: 'Error al encolar el evento del bridge' })
    })
  })
})
