export interface ITranslateRequest {
  text: string
  targetLang: string
}

export interface ITranslateResponse {
  translatedText: string
  targetLang: string
}

export interface ITranslateRepository {
  translate: (text: string, targetLang: string, systemPrompt: string) => Promise<string | null>
}
