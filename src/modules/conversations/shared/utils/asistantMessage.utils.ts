import {
  AssistantsFlags,
  AssistantsVariables,
  IVariableOptions,
  assistantFlagsKey,
  assistantMessageConfig,
  assistantsPrefix,
  assistantsVariablesKey,
} from '../constants/assistant.constants'

export class AssistantMessage {
  cleanMessage: string = ''

  variable: AssistantsVariables | null
  value: string | boolean

  flags: { [key in AssistantsFlags]?: string | boolean } = {}

  constructor(message: string) {
    this.manageMessage(message)
  }

  private manageMessage(message: string): void {
    if (!message) {
      throw new Error('Message is required')
    }

    const words = message.split(' ')

    let messageConfig: IVariableOptions
    let valueStored: string[]

    let flagKey: AssistantsFlags
    let flagValue: string[]

    for (const word of words) {
      // if word is a variable set config and valueStored
      if (word.startsWith(assistantsPrefix.variables)) {
        this.variable = assistantsVariablesKey[word.slice(1)] ?? null

        messageConfig = assistantMessageConfig[this.variable]

        // if variable has defaultValue set it, else initialize valueStored
        if (messageConfig?.defaultValue !== null) {
          this.value = messageConfig.defaultValue
        } else {
          valueStored = []
        }

        continue
      }

      // if valueStored is defined, concat word to valueStored or set value and reset valueStored
      if (valueStored !== undefined) {
        if (word.startsWith(assistantsPrefix.flags)) {
          this.value = valueStored.join(' ')
          valueStored = undefined
        } else if (!messageConfig.manyWords) {
          this.value = word
          valueStored = undefined
          continue
        } else {
          if (messageConfig.manyWords) {
            valueStored.push(word)
            continue
          }
        }
      }

      // if flagKey is defined, concat word to flagValue or set flag and reset flagKey and flagValue
      if (flagKey) {
        if (!word.startsWith(assistantsPrefix.flags)) {
          flagValue.push(word)
          continue
        } else {
          this.flags[flagKey] = flagValue.join(' ')
          flagKey = undefined
          flagValue = undefined
        }
      }

      if (word.startsWith(assistantsPrefix.flags)) {
        const flagKeyFormated = assistantFlagsKey[word.slice(1)]

        // if flagKey does not exist in messageConfig flags, continue
        if (!messageConfig?.flags?.[flagKeyFormated]) {
          continue
        }

        if (messageConfig?.flags[flagKeyFormated]?.defaultValue !== null) {
          this.flags[flagKeyFormated] = messageConfig?.flags[flagKeyFormated].defaultValue
        } else {
          flagKey = flagKeyFormated
          flagValue = []
        }
        continue
      }

      this.cleanMessage += word + ' '
    }

    if (valueStored !== undefined) {
      this.value = valueStored.join(' ')
    }

    if (flagKey) {
      this.flags[flagKey] = flagValue.join(' ')
    }
  }
}
