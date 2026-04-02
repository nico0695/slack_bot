export const assistantsPrefix = {
  variables: '.',
  flags: '-',
}

export enum AssistantsVariables {
  ALERT = 'alert',
  TASK = 'task',
  NOTE = 'note',
  LINK = 'link',
  REMINDER = 'reminder',
  QUESTION = 'question',
  IMAGE = 'image',
  TRANSLATE = 'translate',
  QR = 'qr',
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

  reminder: AssistantsVariables.REMINDER,
  r: AssistantsVariables.REMINDER,

  question: AssistantsVariables.QUESTION,
  q: AssistantsVariables.QUESTION,

  image: AssistantsVariables.IMAGE,
  img: AssistantsVariables.IMAGE,
  i: AssistantsVariables.IMAGE,

  translate: AssistantsVariables.TRANSLATE,
  tr: AssistantsVariables.TRANSLATE,

  qr: AssistantsVariables.QR,
}

export enum AssistantsFlags {
  DESCRIPTION = 'description',
  LIST = 'list',
  LIST_TAG = 'list_tag',
  TAG = 'tag',
  TITLE = 'title',
  RECURRENCE_TYPE = 'recurrence_type',
  TIME_OF_DAY = 'time_of_day',
  WEEK_DAYS = 'week_days',
  MONTH_DAYS = 'month_days',
  ID = 'id',
  CHECK = 'check',
  PAUSE = 'pause',
  RESUME = 'resume',
  DELETE = 'delete',
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

  recurrence: AssistantsFlags.RECURRENCE_TYPE,
  rt: AssistantsFlags.RECURRENCE_TYPE,

  at: AssistantsFlags.TIME_OF_DAY,

  weekDays: AssistantsFlags.WEEK_DAYS,
  wd: AssistantsFlags.WEEK_DAYS,

  monthDays: AssistantsFlags.MONTH_DAYS,
  md: AssistantsFlags.MONTH_DAYS,

  id: AssistantsFlags.ID,

  check: AssistantsFlags.CHECK,
  pause: AssistantsFlags.PAUSE,
  resume: AssistantsFlags.RESUME,
  delete: AssistantsFlags.DELETE,

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
  [AssistantsVariables.REMINDER]: {
    defaultValue: null,
    manyWords: true,
    flags: {
      [AssistantsFlags.RECURRENCE_TYPE]: {
        defaultValue: null,
      },
      [AssistantsFlags.TIME_OF_DAY]: {
        defaultValue: null,
      },
      [AssistantsFlags.WEEK_DAYS]: {
        defaultValue: null,
      },
      [AssistantsFlags.MONTH_DAYS]: {
        defaultValue: null,
      },
      [AssistantsFlags.ID]: {
        defaultValue: null,
      },
      [AssistantsFlags.LIST]: {
        defaultValue: true,
      },
      [AssistantsFlags.CHECK]: {
        defaultValue: true,
      },
      [AssistantsFlags.PAUSE]: {
        defaultValue: true,
      },
      [AssistantsFlags.RESUME]: {
        defaultValue: true,
      },
      [AssistantsFlags.DELETE]: {
        defaultValue: true,
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
  [AssistantsVariables.TRANSLATE]: {
    defaultValue: null,
    manyWords: true,
  },
  [AssistantsVariables.QR]: {
    defaultValue: null,
    manyWords: true,
  },
}
