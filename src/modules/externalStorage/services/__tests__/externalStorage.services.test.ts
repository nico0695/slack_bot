import ExternalStorageServices from '../externalStorage.services'
import { StorageSourceModule } from '../../shared/constants/externalStorage.constants'

const mockLogFns = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
  fatal: jest.fn(),
}

jest.mock('../../../../config/logger', () => ({
  createModuleLogger: jest.fn().mockReturnValue({
    info: (...args: any[]) => mockLogFns.info(...args),
    error: (...args: any[]) => mockLogFns.error(...args),
    warn: (...args: any[]) => mockLogFns.warn(...args),
    debug: (...args: any[]) => mockLogFns.debug(...args),
    fatal: (...args: any[]) => mockLogFns.fatal(...args),
  }),
}))

// Mock repositories
const mockApiStorageRepo = {
  uploadFile: jest.fn(),
  getFile: jest.fn(),
  listFiles: jest.fn(),
  deleteFile: jest.fn(),
  downloadFromUrl: jest.fn(),
}

const mockDataSource = {
  createStoredFile: jest.fn(),
  getStoredFileById: jest.fn(),
  getStoredFileByStorageId: jest.fn(),
  getStoredFilesByModule: jest.fn(),
  updateDownloadUrl: jest.fn(),
  deleteStoredFile: jest.fn(),
}

jest.mock('../../repositories/apiStorage/apiStorage.repository', () => ({
  __esModule: true,
  default: {
    getInstance: jest.fn().mockImplementation(() => mockApiStorageRepo),
  },
}))

jest.mock('../../repositories/database/externalStorage.dataSource', () => ({
  __esModule: true,
  default: {
    getInstance: jest.fn().mockImplementation(() => mockDataSource),
  },
}))

describe('ExternalStorageServices', () => {
  let service: ExternalStorageServices

  beforeEach(() => {
    jest.clearAllMocks()
    // Reset singleton
    Object.defineProperty(ExternalStorageServices, 'instance', { value: undefined, writable: true })
    service = ExternalStorageServices.getInstance()
  })

  describe('Singleton Pattern', () => {
    it('should return the same instance on multiple calls', () => {
      const instance1 = ExternalStorageServices.getInstance()
      const instance2 = ExternalStorageServices.getInstance()

      expect(instance1).toBe(instance2)
    })
  })

  describe('uploadFile', () => {
    const uploadOptions = {
      fileBuffer: Buffer.from('test-data'),
      fileName: 'test.png',
      mimeType: 'image/png',
      sourceModule: StorageSourceModule.IMAGES,
    }

    it('should upload file and store locally', async () => {
      const apiResult = {
        id: 'storage-123',
        name: 'test.png',
        key: 'images/generated/test.png',
        path: 'images/generated',
        mimeType: 'image/png',
        size: 1024,
        downloadUrl: 'https://storage.example.com/test.png',
      }

      const storedFile = {
        id: 1,
        storageFileId: 'storage-123',
        fileName: 'test.png',
        path: 'images/generated',
        fullPath: 'images/generated/test.png',
        mimeType: 'image/png',
        size: 1024,
      }

      mockApiStorageRepo.uploadFile.mockResolvedValue(apiResult)
      mockDataSource.createStoredFile.mockResolvedValue(storedFile)

      const result = await service.uploadFile(uploadOptions)

      expect(result.data).toBeDefined()
      expect(result.data.localId).toBe(1)
      expect(result.data.storageFileId).toBe('storage-123')
      expect(result.data.fileName).toBe('test.png')
      expect(result.error).toBeUndefined()

      expect(mockApiStorageRepo.uploadFile).toHaveBeenCalledWith(
        uploadOptions.fileBuffer,
        'test.png',
        { path: 'images/generated', customName: undefined, metadata: undefined }
      )
      expect(mockDataSource.createStoredFile).toHaveBeenCalledWith(
        expect.objectContaining({
          storageFileId: 'storage-123',
          sourceModule: StorageSourceModule.IMAGES,
        })
      )
    })

    it('should use custom path when provided', async () => {
      const apiResult = {
        id: 'storage-456',
        name: 'test.png',
        key: 'custom/path/test.png',
        path: 'custom/path',
        mimeType: 'image/png',
        size: 512,
      }

      mockApiStorageRepo.uploadFile.mockResolvedValue(apiResult)
      mockDataSource.createStoredFile.mockResolvedValue({ id: 2, ...apiResult })

      await service.uploadFile({ ...uploadOptions, path: 'custom/path' })

      expect(mockApiStorageRepo.uploadFile).toHaveBeenCalledWith(
        expect.any(Buffer),
        'test.png',
        expect.objectContaining({ path: 'custom/path' })
      )
    })

    it('should fallback to options.mimeType when api does not return mimeType', async () => {
      const apiResult = {
        id: 'storage-123',
        name: 'test.png',
        key: 'images/generated/test.png',
        path: 'images/generated',
        mimeType: null,
        size: 1024,
        downloadUrl: 'https://storage.example.com/test.png',
      }

      mockApiStorageRepo.uploadFile.mockResolvedValue(apiResult)
      mockDataSource.createStoredFile.mockResolvedValue({ id: 1, ...apiResult, mimeType: 'image/png' })

      await service.uploadFile(uploadOptions)

      expect(mockDataSource.createStoredFile).toHaveBeenCalledWith(
        expect.objectContaining({
          mimeType: 'image/png',
        })
      )
    })

    it('should return error when api upload fails', async () => {
      mockApiStorageRepo.uploadFile.mockResolvedValue(null)

      const result = await service.uploadFile(uploadOptions)

      expect(result.error).toBe('Error uploading file to storage')
      expect(result.data).toBeUndefined()
    })

    it('should return error on exception', async () => {
      mockApiStorageRepo.uploadFile.mockRejectedValue(new Error('Network error'))

      const result = await service.uploadFile(uploadOptions)

      expect(result.error).toBe('Error uploading file')
      expect(mockLogFns.error).toHaveBeenCalled()
    })
  })

  describe('uploadFromUrl', () => {
    const urlOptions = {
      sourceUrl: 'https://example.com/image.png',
      fileName: 'downloaded.png',
      sourceModule: StorageSourceModule.IMAGES,
    }

    it('should download from URL and upload', async () => {
      const buffer = Buffer.from('downloaded-data')
      const apiResult = {
        id: 'storage-789',
        name: 'downloaded.png',
        key: 'images/generated/downloaded.png',
        path: 'images/generated',
        mimeType: 'application/octet-stream',
        size: 2048,
      }

      mockApiStorageRepo.downloadFromUrl.mockResolvedValue(buffer)
      mockApiStorageRepo.uploadFile.mockResolvedValue(apiResult)
      mockDataSource.createStoredFile.mockResolvedValue({ id: 3, ...apiResult })

      const result = await service.uploadFromUrl(urlOptions)

      expect(result.data).toBeDefined()
      expect(result.data.storageFileId).toBe('storage-789')
      expect(mockApiStorageRepo.downloadFromUrl).toHaveBeenCalledWith(urlOptions.sourceUrl)
    })

    it('should return error when download fails', async () => {
      mockApiStorageRepo.downloadFromUrl.mockResolvedValue(null)

      const result = await service.uploadFromUrl(urlOptions)

      expect(result.error).toBe('Error downloading file from URL')
    })
  })

  describe('getFileDetails', () => {
    it('should get file details with fresh download URL', async () => {
      const storedFile = {
        id: 1,
        storageFileId: 'storage-123',
        fileName: 'test.png',
        path: 'images/generated',
        mimeType: 'image/png',
        size: 1024,
        downloadUrl: 'https://old-url.com/test.png',
        sourceModule: StorageSourceModule.IMAGES,
        metadata: null,
        createdAt: new Date(),
      }

      const apiFile = {
        id: 'storage-123',
        downloadUrl: 'https://new-url.com/test.png',
      }

      mockDataSource.getStoredFileById.mockResolvedValue(storedFile)
      mockApiStorageRepo.getFile.mockResolvedValue(apiFile)

      const result = await service.getFileDetails(1)

      expect(result.data).toBeDefined()
      expect(result.data.downloadUrl).toBe('https://new-url.com/test.png')
      expect(mockDataSource.updateDownloadUrl).toHaveBeenCalledWith(
        1,
        'https://new-url.com/test.png'
      )
    })

    it('should return error when file not found locally', async () => {
      mockDataSource.getStoredFileById.mockResolvedValue(null)

      const result = await service.getFileDetails(999)

      expect(result.error).toBe('File not found')
    })

    it('should return error when api fails', async () => {
      mockDataSource.getStoredFileById.mockResolvedValue({
        id: 1,
        storageFileId: 'storage-123',
      })
      mockApiStorageRepo.getFile.mockResolvedValue(null)

      const result = await service.getFileDetails(1)

      expect(result.error).toBe('Error retrieving file details from storage')
    })
  })

  describe('getDownloadUrl', () => {
    it('should return download URL', async () => {
      const storedFile = {
        id: 1,
        storageFileId: 'storage-123',
        fileName: 'test.png',
        path: 'images/generated',
        mimeType: 'image/png',
        size: 1024,
        downloadUrl: 'https://old.com/test.png',
        sourceModule: StorageSourceModule.IMAGES,
        metadata: null,
        createdAt: new Date(),
      }

      mockDataSource.getStoredFileById.mockResolvedValue(storedFile)
      mockApiStorageRepo.getFile.mockResolvedValue({
        downloadUrl: 'https://presigned.com/test.png',
      })

      const result = await service.getDownloadUrl(1)

      expect(result.data).toBe('https://presigned.com/test.png')
    })

    it('should propagate error from getFileDetails', async () => {
      mockDataSource.getStoredFileById.mockResolvedValue(null)

      const result = await service.getDownloadUrl(999)

      expect(result.error).toBe('File not found')
    })
  })

  describe('listFiles', () => {
    it('should list files from api storage', async () => {
      const mockResponse = {
        files: [{ id: '1', name: 'test.png' }],
        pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
      }

      mockApiStorageRepo.listFiles.mockResolvedValue(mockResponse)

      const result = await service.listFiles({ page: 1, limit: 10 })

      expect(result.data).toEqual(mockResponse)
    })

    it('should return error when api fails', async () => {
      mockApiStorageRepo.listFiles.mockResolvedValue(null)

      const result = await service.listFiles()

      expect(result.error).toBe('Error listing files from storage')
    })
  })

  describe('listFilesByModule', () => {
    it('should list files filtered by module path', async () => {
      const mockResponse = {
        files: [],
        pagination: { page: 1, limit: 10, total: 0, totalPages: 0 },
      }

      mockApiStorageRepo.listFiles.mockResolvedValue(mockResponse)

      const result = await service.listFilesByModule(StorageSourceModule.IMAGES)

      expect(result.data).toEqual(mockResponse)
      expect(mockApiStorageRepo.listFiles).toHaveBeenCalledWith({
        searchPath: 'images/generated',
      })
    })
  })

  describe('deleteFile', () => {
    it('should delete file from storage and local DB', async () => {
      mockDataSource.getStoredFileById.mockResolvedValue({
        id: 1,
        storageFileId: 'storage-123',
      })
      mockApiStorageRepo.deleteFile.mockResolvedValue(true)
      mockDataSource.deleteStoredFile.mockResolvedValue(undefined)

      const result = await service.deleteFile(1)

      expect(result.data).toBe(true)
      expect(mockApiStorageRepo.deleteFile).toHaveBeenCalledWith('storage-123')
      expect(mockDataSource.deleteStoredFile).toHaveBeenCalledWith(1)
    })

    it('should return error when file not found', async () => {
      mockDataSource.getStoredFileById.mockResolvedValue(null)

      const result = await service.deleteFile(999)

      expect(result.error).toBe('File not found')
      expect(mockApiStorageRepo.deleteFile).not.toHaveBeenCalled()
    })

    it('should return error when remote delete fails', async () => {
      mockDataSource.getStoredFileById.mockResolvedValue({
        id: 1,
        storageFileId: 'storage-123',
      })
      mockApiStorageRepo.deleteFile.mockResolvedValue(false)

      const result = await service.deleteFile(1)

      expect(result.error).toBe('Error deleting file from storage')
      expect(mockDataSource.deleteStoredFile).not.toHaveBeenCalled()
    })
  })
})
