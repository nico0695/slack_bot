import { ConversationProviders } from '../constants/conversationFlow'
import { roleTypes } from '../constants/openai'
import { assistantPromptFlagsLite2 } from '../constants/prompt.constants'
import { IConversation } from '../interfaces/converstions'

const PROMPT_TIME_ZONE = 'America/Argentina/Buenos_Aires'

export interface IClassificationMessagesInput {
  message: string
  contextBlock?: string
  now?: Date
}

/**
 * Date as the prompts expect it, in Argentina time: "Mon, 2026-11-09 14:05:09".
 */
export const formatPromptDate = (now: Date = new Date()): string => {
  const dateFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: PROMPT_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  })
  const timeFormatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: PROMPT_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
  const parts = dateFormatter.formatToParts(now)
  const weekday = parts.find((p) => p.type === 'weekday')?.value ?? ''
  const date = parts
    .filter((p) => p.type !== 'weekday' && p.type !== 'literal')
    .map((p) => p.value)
    .join('-')
  const time = timeFormatter.format(now)

  return `${weekday}, ${date} ${time}`
}

/**
 * Replaces every "<fecha>" placeholder of a prompt with the formatted date.
 */
export const applyDateContext = (prompt: string, now: Date = new Date()): string => {
  if (!prompt.includes('<fecha>')) return prompt

  return prompt.replace(/<fecha>/g, formatPromptDate(now))
}

/**
 * Dynamic block appended after the classifier instructions. Empty when there is nothing to add.
 */
export const buildClassifierContextBlock = (
  userDataContext: string,
  historyContext: string
): string => {
  const parts: string[] = []

  if (userDataContext && userDataContext !== '[SIN_DATOS_PREVIOS]') {
    parts.push(`\nDATOS_USUARIO:\n${userDataContext}`)
  }

  if (historyContext) {
    parts.push(`\nHISTORIAL:\n${historyContext}`)
  }

  return parts.length > 0 ? '\n' + parts.join('\n') : ''
}

/**
 * Messages of the intent classification call: [system, user].
 * System content order: stable instructions, date, dynamic context block.
 * Pure given `now`, so it can be reused outside the service (e.g. offline evaluation).
 */
export const buildClassificationMessages = ({
  message,
  contextBlock = '',
  now,
}: IClassificationMessagesInput): IConversation[] => [
  {
    role: roleTypes.system,
    content: applyDateContext(assistantPromptFlagsLite2, now) + contextBlock,
    provider: ConversationProviders.ASSISTANT,
  },
  {
    role: roleTypes.user,
    content: message,
    provider: ConversationProviders.ASSISTANT,
  },
]
