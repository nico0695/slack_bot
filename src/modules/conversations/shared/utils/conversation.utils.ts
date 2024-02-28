// ! unused file - replaced by AssistantMessage
interface IMessageInfo {
  cleanMessage: string
  variables: { [key: string]: string }
  flags: string[]
}

const messagesOptionsKey = {
  variables: '.',
  flags: '-',
}

/**
 * Extracts variables and flags from a message
 * @param message
 * @returns { cleanMessage: string, variables: { [key: string]: string }, flags: string[] }
 */
export const extractVariablesAndFlags = (message: string): IMessageInfo => {
  const variables: { [key: string]: string } = {}
  const flags: string[] = []

  const cleanMessage = message
    .split(' ')
    .map((word, index, words) => {
      if (index > 0 && words[index - 1]?.startsWith(messagesOptionsKey.variables)) {
        return ''
      }

      if (word.startsWith(messagesOptionsKey.variables)) {
        const variableName = word.slice(1)
        const nextWord = words[index + 1]
        if (nextWord && !nextWord.startsWith(messagesOptionsKey.variables)) {
          variables[variableName] = nextWord
          return ''
        }
      }

      if (word.startsWith(messagesOptionsKey.flags)) {
        flags.push(word)
        return ''
      }
      return word
    })
    .join(' ')
    .trim()

  return {
    cleanMessage,
    variables,
    flags,
  }
}
