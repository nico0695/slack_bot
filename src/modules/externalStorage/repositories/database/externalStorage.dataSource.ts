import { StoredFile } from '../../../../entities/storedFile'
import { StorageSourceModule } from '../../shared/constants/externalStorage.constants'
import { IStoredFileInput } from '../../shared/interfaces/externalStorage.interfaces'

export default class ExternalStorageDataSource {
  static #instance: ExternalStorageDataSource

  private constructor() {}

  static getInstance(): ExternalStorageDataSource {
    if (this.#instance) {
      return this.#instance
    }

    this.#instance = new ExternalStorageDataSource()
    return this.#instance
  }

  public async createStoredFile(data: IStoredFileInput): Promise<StoredFile> {
    const file = new StoredFile()
    file.storageFileId = data.storageFileId
    file.fileName = data.fileName
    file.path = data.path
    file.fullPath = data.fullPath
    file.mimeType = data.mimeType
    file.size = data.size
    file.downloadUrl = data.downloadUrl
    file.metadata = data.metadata
    file.sourceModule = data.sourceModule

    await file.save()
    return file
  }

  public async getStoredFileById(id: number): Promise<StoredFile | null> {
    return await StoredFile.findOneBy({ id })
  }

  public async getStoredFileByStorageId(storageFileId: string): Promise<StoredFile | null> {
    return await StoredFile.findOneBy({ storageFileId })
  }

  public async getStoredFilesByModule(sourceModule: StorageSourceModule): Promise<StoredFile[]> {
    return await StoredFile.find({ where: { sourceModule } })
  }

  public async updateDownloadUrl(id: number, downloadUrl: string): Promise<void> {
    await StoredFile.update(id, { downloadUrl })
  }

  public async deleteStoredFile(id: number): Promise<void> {
    await StoredFile.delete(id)
  }
}
