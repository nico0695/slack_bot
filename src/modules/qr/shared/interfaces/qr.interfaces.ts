export interface IQrRequest {
  content: string
}

export interface IQrResponse {
  image: string
  format: string
  content: string
}

export interface IQrRepository {
  generateQrCode: (content: string) => Promise<string | null>
}
