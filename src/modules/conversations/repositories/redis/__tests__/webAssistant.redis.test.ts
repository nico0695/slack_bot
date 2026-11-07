import { RedisRepository } from '../conversations.redis'
import { rWebAssistantKey, conversationFlowPrefix, rPersonalAssistantKey } from '../redis.constants'
import { roleTypes } from '../../../shared/constants/openai'
import { ConversationProviders } from '../../../shared/constants/conversationFlow'

const getMock = jest.fn()
const setMock = jest.fn()
jest.mock('../../../../../config/redisConfig', () => ({
  RedisConfig: { getClient: () => ({ get: getMock, set: setMock }) },
}))

let repository: RedisRepository
beforeEach(() => {
  jest.resetAllMocks()
  repository = new RedisRepository()
})

it('uses distinct explicit web keys outside channel enumeration and personal context', () => {
  expect(rWebAssistantKey(1)).toBe('cb_assistant_web_user_1')
  expect(rWebAssistantKey(91)).toBe('cb_assistant_web_user_91')
  expect(rWebAssistantKey(1)).not.toBe(rWebAssistantKey(91))
  expect(rWebAssistantKey(1)).not.toBe(rPersonalAssistantKey(1))
  expect(rWebAssistantKey(1).startsWith(conversationFlowPrefix)).toBe(false)
})

it('returns empty for missing and null for corrupt/unavailable history', async () => {
  getMock
    .mockResolvedValueOnce(null)
    .mockResolvedValueOnce('{')
    .mockRejectedValueOnce(new Error('private detail'))
  expect(await repository.getWebAssistantMessages(1)).toEqual([])
  expect(await repository.getWebAssistantMessages(1)).toBeNull()
  expect(await repository.getWebAssistantMessages(1)).toBeNull()
})

it.each([
  '{}',
  '[null]',
  '[{"role":"system","content":"x","provider":"web"}]',
  '[{"role":"user","content":42,"provider":"web"}]',
  '[{"role":"user","content":"x","provider":"slack"}]',
])('rejects corrupt web entries: %s', async (value) => {
  getMock.mockResolvedValue(value)
  expect(await repository.getWebAssistantMessages(1)).toBeNull()
})

it('preserves display payloads and saves at most twenty entries without expiration', async () => {
  const entry = {
    role: roleTypes.assistant,
    content: 'data:image/png;base64,abc',
    contentBlock: { blocks: [] },
    provider: ConversationProviders.ASSISTANT,
  }
  setMock.mockResolvedValue('OK')
  expect(await repository.saveWebAssistantMessages(91, Array(21).fill(entry))).toBe(true)
  expect(setMock).toHaveBeenCalledWith(rWebAssistantKey(91), JSON.stringify(Array(20).fill(entry)))
  getMock.mockResolvedValue(JSON.stringify([entry]))
  expect(await repository.getWebAssistantMessages(91)).toEqual([entry])
})

it('reports a write failure safely', async () => {
  setMock.mockRejectedValue(new Error('private detail'))
  expect(await repository.saveWebAssistantMessages(1, [])).toBe(false)
})
