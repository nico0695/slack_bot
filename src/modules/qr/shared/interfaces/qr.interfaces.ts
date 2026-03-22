export interface IQrVisualOptions {
  foregroundColor: string
  backgroundColor: string
  errorCorrectionLevel: 'L' | 'M' | 'Q' | 'H'
}

export interface IQrParsedInput {
  content: string
  visualOptions: Partial<IQrVisualOptions>
}

export interface IQrShortcut {
  flag: string
  description: string
  format: (args: string) => string | null
}

export interface IQrGenerateOptions {
  content: string
  foregroundColor?: string
  backgroundColor?: string
  errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H'
}

export interface IQrResult {
  buffer: Buffer
  content: string
}
