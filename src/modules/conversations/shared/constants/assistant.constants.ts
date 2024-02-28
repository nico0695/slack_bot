export const assistantsPrefix = {
  variables: '.',
  flags: '-',
}

export enum AssistantsVariables {
  ALERT = 'alert',
  TASK = 'task',
  QUESTION = 'question',
}

export const assistantsVariablesKey: {
  [key: string]: AssistantsVariables
} = {
  alert: AssistantsVariables.ALERT,
  a: AssistantsVariables.ALERT,

  task: AssistantsVariables.TASK,
  t: AssistantsVariables.TASK,

  question: AssistantsVariables.QUESTION,
  q: AssistantsVariables.QUESTION,
}

export enum AssistantsFlags {
  DESCRIPTION = 'description',
  LIST = 'list',
}

export const assistantFlagsKey: {
  [key: string]: AssistantsFlags
} = {
  description: AssistantsFlags.DESCRIPTION,
  d: AssistantsFlags.DESCRIPTION,

  list: AssistantsFlags.LIST,
  l: AssistantsFlags.LIST,
}

interface IFlagOptions {
  defaultValue: boolean | null
}

export interface IVariableOptions {
  defaultValue: boolean | null
  manyWords?: boolean
  flags?: {
    [key in AssistantsFlags]?: IFlagOptions
  }
}

type IAssistantMessageConfig = {
  [key in AssistantsVariables]: IVariableOptions
}

export const assistantMessageConfig: IAssistantMessageConfig = {
  [AssistantsVariables.ALERT]: {
    defaultValue: null,
  },
  [AssistantsVariables.TASK]: {
    defaultValue: null,
    manyWords: true,
    flags: {
      [AssistantsFlags.DESCRIPTION]: {
        defaultValue: null,
      },
      [AssistantsFlags.LIST]: {
        defaultValue: true,
      },
    },
  },
  [AssistantsVariables.QUESTION]: {
    defaultValue: true,
  },
}
