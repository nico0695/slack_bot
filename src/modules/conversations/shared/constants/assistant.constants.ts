export const assistantsPrefix = {
  variables: '.',
  flags: '-',
}

export enum AssistantsVariables {
  ALERT = 'alert',
  TASK = 'task',
  NOTE = 'note',
  QUESTION = 'question',
}

export const assistantsVariablesKey: {
  [key: string]: AssistantsVariables
} = {
  alert: AssistantsVariables.ALERT,
  a: AssistantsVariables.ALERT,

  task: AssistantsVariables.TASK,
  t: AssistantsVariables.TASK,

  note: AssistantsVariables.NOTE,
  n: AssistantsVariables.NOTE,

  question: AssistantsVariables.QUESTION,
  q: AssistantsVariables.QUESTION,
}

export enum AssistantsFlags {
  DESCRIPTION = 'description',
  LIST = 'list',
  LIST_TAG = 'list_tag',
  TAG = 'tag',
}

export const assistantFlagsKey: {
  [key: string]: AssistantsFlags
} = {
  description: AssistantsFlags.DESCRIPTION,
  d: AssistantsFlags.DESCRIPTION,

  tag: AssistantsFlags.TAG,
  t: AssistantsFlags.TAG,

  list: AssistantsFlags.LIST,
  l: AssistantsFlags.LIST,

  listTag: AssistantsFlags.LIST_TAG,
  lt: AssistantsFlags.LIST_TAG,
}

interface IFlagOptions {
  defaultValue: boolean | null | string
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
    flags: {
      [AssistantsFlags.LIST]: {
        defaultValue: true,
      },
    },
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
  [AssistantsVariables.NOTE]: {
    defaultValue: null,
    manyWords: true,
    flags: {
      [AssistantsFlags.DESCRIPTION]: {
        defaultValue: null,
      },
      [AssistantsFlags.LIST]: {
        defaultValue: true,
      },
      [AssistantsFlags.LIST_TAG]: {
        defaultValue: '',
      },
    },
  },
  [AssistantsVariables.QUESTION]: {
    defaultValue: true,
  },
}
