export const assistantsPrefix = {
  variables: '.',
  flags: '-',
}

export enum AssistantsVariables {
  ALERT = 'alert',
  TASK = 'task',
  NOTE = 'note',
  LINK = 'link',
  QUESTION = 'question',
  IMAGE = 'image',
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

  link: AssistantsVariables.LINK,
  lk: AssistantsVariables.LINK,

  question: AssistantsVariables.QUESTION,
  q: AssistantsVariables.QUESTION,

  image: AssistantsVariables.IMAGE,
  img: AssistantsVariables.IMAGE,
  i: AssistantsVariables.IMAGE,
}

export enum AssistantsFlags {
  DESCRIPTION = 'description',
  LIST = 'list',
  LIST_TAG = 'list_tag',
  TAG = 'tag',
  TITLE = 'title',
  SIZE = 'size',
  QUALITY = 'quality',
  STYLE = 'style',
  NUMBER = 'number',
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

  title: AssistantsFlags.TITLE,
  tt: AssistantsFlags.TITLE,

  size: AssistantsFlags.SIZE,
  s: AssistantsFlags.SIZE,

  quality: AssistantsFlags.QUALITY,
  qty: AssistantsFlags.QUALITY,

  style: AssistantsFlags.STYLE,
  st: AssistantsFlags.STYLE,

  number: AssistantsFlags.NUMBER,
  num: AssistantsFlags.NUMBER,
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
      [AssistantsFlags.TAG]: {
        defaultValue: null,
      },
      [AssistantsFlags.LIST_TAG]: {
        defaultValue: null,
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
        defaultValue: null,
      },
    },
  },
  [AssistantsVariables.LINK]: {
    defaultValue: null,
    manyWords: true,
    flags: {
      [AssistantsFlags.DESCRIPTION]: {
        defaultValue: null,
      },
      [AssistantsFlags.TAG]: {
        defaultValue: null,
      },
      [AssistantsFlags.LIST]: {
        defaultValue: true,
      },
      [AssistantsFlags.LIST_TAG]: {
        defaultValue: null,
      },
      [AssistantsFlags.TITLE]: {
        defaultValue: null,
      },
    },
  },
  [AssistantsVariables.QUESTION]: {
    defaultValue: true,
  },
  [AssistantsVariables.IMAGE]: {
    defaultValue: null,
    manyWords: true,
    flags: {
      [AssistantsFlags.LIST]: {
        defaultValue: true,
      },
      [AssistantsFlags.LIST_TAG]: {
        defaultValue: null,
      },
      [AssistantsFlags.SIZE]: {
        defaultValue: null,
      },
      [AssistantsFlags.QUALITY]: {
        defaultValue: null,
      },
      [AssistantsFlags.STYLE]: {
        defaultValue: null,
      },
      [AssistantsFlags.NUMBER]: {
        defaultValue: null,
      },
    },
  },
}
