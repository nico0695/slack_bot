import { createModuleLogger } from '../../../config/logger'
import { GenericResponse } from '../../../shared/interfaces/services'
import ApiStorageRepository from '../repositories/apiStorage/apiStorage.repository'
import ExternalStorageDataSource from '../repositories/database/externalStorage.dataSource'
import { StoragePathByModule } from '../shared/constants/externalStorage.constants'
import {
  IStorageUploadOptions,
  IStorageUploadFromUrlOptions,
  IStorageUploadResult,
  IStorageFileDetails,
  IStorageListOptions,
  IStorageApiListResponse,
} from '../shared/interfaces/externalStorage.interfaces'

const log = createModuleLogger('externalStorage.service')

export default class ExternalStorageServices {
  private static instance: ExternalStorageServices

  private apiStorageRepo: ApiStorageRepository
  private dataSource: ExternalStorageDataSource

  private constructor() {
    this.apiStorageRepo = ApiStorageRepository.getInstance()
    this.dataSource = ExternalStorageDataSource.getInstance()
  }

  static getInstance(): ExternalStorageServices {
    if (this.instance) {
      return this.instance
    }

    this.instance = new ExternalStorageServices()
    return this.instance
  }

  async uploadFile(options: IStorageUploadOptions): Promise<GenericResponse<IStorageUploadResult>> {
    try {
      const path = options.path || StoragePathByModule[options.sourceModule]

      const apiResult = await this.apiStorageRepo.uploadFile(
        options.fileBuffer,
        options.fileName,
        {
          path,
          customName: options.customName,
          metadata: options.metadata,
        }
      )

      if (!apiResult) {
        return { error: 'Error uploading file to storage' }
      }

      const storedFile = await this.dataSource.createStoredFile({
        storageFileId: apiResult.id,
        fileName: apiResult.name,
        path: apiResult.path,
        fullPath: apiResult.key,
        mimeType: apiResult.mimeType || options.mimeType,
        size: apiResult.size,
        downloadUrl: apiResult.downloadUrl,
        metadata: options.metadata,
        sourceModule: options.sourceModule,
      })

      log.info(
        { localId: storedFile.id, storageFileId: apiResult.id, sourceModule: options.sourceModule },
        'File uploaded successfully'
      )

      return {
        data: {
          localId: storedFile.id,
          storageFileId: apiResult.id,
          fileName: apiResult.name,
          path: apiResult.path,
          mimeType: apiResult.mimeType,
          size: apiResult.size,
        },
      }
    } catch (error) {
      log.error({ err: error }, 'uploadFile failed')
      return { error: 'Error uploading file' }
    }
  }

  async uploadFromUrl(
    options: IStorageUploadFromUrlOptions
  ): Promise<GenericResponse<IStorageUploadResult>> {
    try {
      const buffer = await this.apiStorageRepo.downloadFromUrl(options.sourceUrl)

      if (!buffer) {
        return { error: 'Error downloading file from URL' }
      }

      return await this.uploadFile({
        fileBuffer: buffer,
        fileName: options.fileName,
        mimeType: options.mimeType || 'application/octet-stream',
        sourceModule: options.sourceModule,
        metadata: options.metadata,
      })
    } catch (error) {
      log.error({ err: error }, 'uploadFromUrl failed')
      return { error: 'Error uploading file from URL' }
    }
  }

  async getFileDetails(localId: number): Promise<GenericResponse<IStorageFileDetails>> {
    try {
      const storedFile = await this.dataSource.getStoredFileById(localId)

      if (!storedFile) {
        return { error: 'File not found' }
      }

      const apiFile = await this.apiStorageRepo.getFile(storedFile.storageFileId)

      if (!apiFile) {
        return { error: 'Error retrieving file details from storage' }
      }

      if (apiFile.downloadUrl) {
        await this.dataSource.updateDownloadUrl(localId, apiFile.downloadUrl)
      }

      return {
        data: {
          localId: storedFile.id,
          storageFileId: storedFile.storageFileId,
          fileName: storedFile.fileName,
          path: storedFile.path,
          mimeType: storedFile.mimeType,
          size: storedFile.size,
          downloadUrl: apiFile.downloadUrl || storedFile.downloadUrl,
          sourceModule: storedFile.sourceModule as any,
          metadata: storedFile.metadata,
          createdAt: storedFile.createdAt,
        },
      }
    } catch (error) {
      log.error({ err: error }, 'getFileDetails failed')
      return { error: 'Error getting file details' }
    }
  }

  async getDownloadUrl(localId: number): Promise<GenericResponse<string>> {
    const result = await this.getFileDetails(localId)

    if (result.error) {
      return { error: result.error }
    }

    return { data: result.data.downloadUrl }
  }

  async listFiles(options?: IStorageListOptions): Promise<GenericResponse<IStorageApiListResponse>> {
    try {
      const result = await this.apiStorageRepo.listFiles(options)

      if (!result) {
        return { error: 'Error listing files from storage' }
      }

      return { data: result }
    } catch (error) {
      log.error({ err: error }, 'listFiles failed')
      return { error: 'Error listing files' }
    }
  }

  async listFilesByModule(
    sourceModule: string
  ): Promise<GenericResponse<IStorageApiListResponse>> {
    const path = StoragePathByModule[sourceModule as keyof typeof StoragePathByModule]

    return await this.listFiles({ searchPath: path })
  }

  async deleteFile(localId: number): Promise<GenericResponse<boolean>> {
    try {
      const storedFile = await this.dataSource.getStoredFileById(localId)

      if (!storedFile) {
        return { error: 'File not found' }
      }

      const deleted = await this.apiStorageRepo.deleteFile(storedFile.storageFileId)

      if (!deleted) {
        return { error: 'Error deleting file from storage' }
      }

      await this.dataSource.deleteStoredFile(localId)

      log.info(
        { localId, storageFileId: storedFile.storageFileId },
        'File deleted successfully'
      )

      return { data: true }
    } catch (error) {
      log.error({ err: error }, 'deleteFile failed')
      return { error: 'Error deleting file' }
    }
  }
}
