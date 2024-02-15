interface IMessageInfo {
  cleanMessage: string
  variables: { [key: string]: string }
  flags: string[]
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
      if (index > 0 && words[index - 1]?.startsWith('-')) {
        return ''
      }

      if (word.startsWith('-')) {
        const variableName = word.slice(1)
        const nextWord = words[index + 1]
        if (nextWord && !nextWord.startsWith('-')) {
          variables[variableName] = nextWord
          return ''
        }
      }
      if (word.startsWith(':')) {
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
