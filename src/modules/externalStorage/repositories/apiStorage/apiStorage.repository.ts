import axios, { AxiosInstance } from 'axios'
import { createModuleLogger } from '../../../../config/logger'
import {
  IStorageApiFile,
  IStorageApiListResponse,
  IStorageListOptions,
} from '../../shared/interfaces/externalStorage.interfaces'

const log = createModuleLogger('apiStorage.repository')

export default class ApiStorageRepository {
  private static instance: ApiStorageRepository

  private client: AxiosInstance

  private constructor() {
    const baseURL = process.env.STORAGE_API_URL
    const apiKey = process.env.STORAGE_API_KEY

    if (!baseURL) {
      throw new Error('STORAGE_API_URL is not defined in the environment variables.')
    }
    if (!apiKey) {
      throw new Error('STORAGE_API_KEY is not defined in the environment variables.')
    }

    this.client = axios.create({
      baseURL,
      headers: {
        'X-API-Key': apiKey,
      },
    })
  }

  static getInstance(): ApiStorageRepository {
    if (this.instance) {
      return this.instance
    }

    this.instance = new ApiStorageRepository()
    return this.instance
  }

  async uploadFile(
    buffer: Buffer,
    fileName: string,
    options?: { path?: string; customName?: string; metadata?: Record<string, string> }
  ): Promise<IStorageApiFile | null> {
    try {
      const form = new FormData()
      form.append('file', new Blob([new Uint8Array(buffer)]), fileName)

      if (options?.path) {
        form.append('path', options.path)
      }
      if (options?.customName) {
        form.append('customName', options.customName)
      }
      if (options?.metadata) {
        form.append('metadata', JSON.stringify(options.metadata))
      }

      const response = await this.client.post('/files/upload', form, {
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      })

      return response.data
    } catch (error) {
      log.error({ err: error }, 'uploadFile failed')
      return null
    }
  }

  async getFile(fileId: string): Promise<IStorageApiFile | null> {
    try {
      const response = await this.client.get(`/files/${fileId}`)
      return response.data
    } catch (error) {
      log.error({ err: error, fileId }, 'getFile failed')
      return null
    }
  }

  async listFiles(options?: IStorageListOptions): Promise<IStorageApiListResponse | null> {
    try {
      const params: Record<string, string | number> = {}

      if (options?.search) params.search = options.search
      if (options?.searchPath) params.searchPath = options.searchPath
      if (options?.mime) params.mime = options.mime
      if (options?.sizeMin) params.sizeMin = options.sizeMin
      if (options?.sizeMax) params.sizeMax = options.sizeMax
      if (options?.dateFrom) params.dateFrom = options.dateFrom
      if (options?.dateTo) params.dateTo = options.dateTo
      if (options?.page) params.page = options.page
      if (options?.limit) params.limit = options.limit

      const response = await this.client.get('/files', { params })
      return response.data
    } catch (error) {
      log.error({ err: error }, 'listFiles failed')
      return null
    }
  }

  async deleteFile(fileId: string): Promise<boolean> {
    try {
      await this.client.delete(`/files/${fileId}`)
      return true
    } catch (error) {
      log.error({ err: error, fileId }, 'deleteFile failed')
      return false
    }
  }

  async downloadFromUrl(url: string): Promise<Buffer | null> {
    try {
      const response = await axios.get(url, { responseType: 'arraybuffer' })
      return Buffer.from(response.data)
    } catch (error) {
      log.error({ err: error, url }, 'downloadFromUrl failed')
      return null
    }
  }
}
