export interface IQrRequest {
  text: string
}

export interface IQrResponse {
  qrBase64: string
}

export interface IQrBufferResponse {
  qrBuffer: Buffer
}
