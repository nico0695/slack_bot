import { StorageSourceModule } from '../constants/externalStorage.constants'

// --- API Storage response types ---

export interface IStorageApiFile {
  id: string
  name: string
  key: string
  path: string
  mimeType: string
  size: number
  downloadUrl?: string
  createdAt: string
  updatedAt: string
}

export interface IStorageApiPagination {
  page: number
  limit: number
  total: number
  totalPages: number
}

export interface IStorageApiListResponse {
  files: IStorageApiFile[]
  pagination: IStorageApiPagination
}

// --- Input types ---

export interface IStorageUploadOptions {
  fileBuffer: Buffer
  fileName: string
  mimeType: string
  sourceModule: StorageSourceModule
  path?: string
  customName?: string
  metadata?: Record<string, string>
}

export interface IStorageUploadFromUrlOptions {
  sourceUrl: string
  fileName: string
  sourceModule: StorageSourceModule
  mimeType?: string
  metadata?: Record<string, string>
}

export interface IStorageListOptions {
  search?: string
  searchPath?: string
  mime?: string
  sizeMin?: number
  sizeMax?: number
  dateFrom?: string
  dateTo?: string
  page?: number
  limit?: number
}

// --- Output types ---

export interface IStorageUploadResult {
  localId: number
  storageFileId: string
  fileName: string
  path: string
  mimeType: string
  size: number
}

export interface IStorageFileDetails {
  localId: number
  storageFileId: string
  fileName: string
  path: string
  mimeType: string
  size: number
  downloadUrl: string
  sourceModule: StorageSourceModule
  metadata?: Record<string, string>
  createdAt: Date
}

// --- Entity input ---

export interface IStoredFileInput {
  storageFileId: string
  fileName: string
  path: string
  fullPath: string
  mimeType: string
  size: number
  downloadUrl?: string
  metadata?: Record<string, string>
  sourceModule: StorageSourceModule
}
