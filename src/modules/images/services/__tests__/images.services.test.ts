import ImagesServices from '../images.services'
import { ImageProvider } from '../../shared/interfaces/imageRepository.interface'
import { StorageSourceModule } from '../../../externalStorage/shared/constants/externalStorage.constants'

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

const mockImageRepository = {
  generateImage: jest.fn(),
}

const mockImagesDataSource = {
  createImages: jest.fn(),
  getAllImages: jest.fn(),
}

const mockExternalStorageServices = {
  uploadFromUrl: jest.fn(),
  getFileDetails: jest.fn(),
}

const mockUsersServices = {
  getUserById: jest.fn(),
}

jest.mock('../../shared/constants/imageRepository', () => ({
  ImageRepositoryType: { OPENAI: 'OPENAI' },
  ImageRepositoryByType: {
    OPENAI: { getInstance: () => mockImageRepository },
  },
  getDefaultImageRepositoryType: () => 'OPENAI',
}))

jest.mock('../../repositories/database/images.dataSource', () => ({
  __esModule: true,
  default: {
    getInstance: () => mockImagesDataSource,
  },
}))

jest.mock('../../../externalStorage/services/externalStorage.services', () => ({
  __esModule: true,
  default: {
    getInstance: () => mockExternalStorageServices,
  },
}))

jest.mock('../../../users/services/users.services', () => ({
  __esModule: true,
  default: {
    getInstance: () => mockUsersServices,
  },
}))

const MOCK_PROVIDER_URL = 'https://oaidalleapi.com/temp-img.png'
const MOCK_STORAGE_URL = 'https://f005.backblazeb2.com/persistent-img.png'
const MOCK_STORAGE_FILE_ID = 'storage-abc-123'
const MOCK_LOCAL_ID = 42

const mockUploadSuccess = (): void => {
  mockExternalStorageServices.uploadFromUrl.mockResolvedValue({
    data: {
      localId: MOCK_LOCAL_ID,
      storageFileId: MOCK_STORAGE_FILE_ID,
      fileName: 'img_test.png',
      path: 'images/generated',
      mimeType: 'image/png',
      size: 2048,
    },
  })
  mockExternalStorageServices.getFileDetails.mockResolvedValue({
    data: {
      localId: MOCK_LOCAL_ID,
      storageFileId: MOCK_STORAGE_FILE_ID,
      downloadUrl: MOCK_STORAGE_URL,
    },
  })
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
const mockGenerateImageResponse = (url = MOCK_PROVIDER_URL) => ({
  images: [{ url, id: 'img-1', createdAt: '2024-01-01' }],
  provider: ImageProvider.OPENAI,
  inferenceId: 'inf-123',
})

describe('ImagesServices', () => {
  let service: ImagesServices

  beforeEach(() => {
    jest.clearAllMocks()
    // Reset singleton
    ;(ImagesServices as any).instance = undefined
    service = ImagesServices.getInstance()
  })

  describe('generateImages (Slack flow)', () => {
    const userData = { slackId: 'U123', slackTeamId: 'T456', username: 'testuser' }
    const sayMock = jest.fn()

    it('should upload image to storage and return persistent URL', async () => {
      mockImageRepository.generateImage.mockResolvedValue(mockGenerateImageResponse())
      mockUploadSuccess()
      mockImagesDataSource.createImages.mockResolvedValue(undefined)

      const result = await service.generateImages('a sunset', userData, sayMock)

      expect(sayMock).toHaveBeenCalledWith('Generando imagen...')
      expect(mockExternalStorageServices.uploadFromUrl).toHaveBeenCalledWith({
        sourceUrl: MOCK_PROVIDER_URL,
        fileName: expect.stringMatching(/^img_\d+\.png$/),
        sourceModule: StorageSourceModule.IMAGES,
        mimeType: 'image/png',
        metadata: {
          prompt: 'a sunset',
          provider: 'openai',
          slackId: 'U123',
          size: '1024x1024',
          quality: 'standard',
        },
      })
      expect(mockExternalStorageServices.getFileDetails).toHaveBeenCalledWith(MOCK_LOCAL_ID)
      expect(result).toContain(MOCK_STORAGE_URL)
      expect(result).toContain('openai')
      expect(result).not.toContain(MOCK_PROVIDER_URL)
    })

    it('should store persistent URL in database', async () => {
      mockImageRepository.generateImage.mockResolvedValue(mockGenerateImageResponse())
      mockUploadSuccess()
      mockImagesDataSource.createImages.mockResolvedValue(undefined)

      await service.generateImages('a sunset', userData, sayMock)

      expect(mockImagesDataSource.createImages).toHaveBeenCalledWith(
        expect.objectContaining({
          imageUrl: MOCK_STORAGE_URL,
          slackId: 'U123',
          slackTeamId: 'T456',
          username: 'testuser',
          prompt: 'a sunset',
        })
      )
    })

    it('should return error message when upload fails', async () => {
      mockImageRepository.generateImage.mockResolvedValue(mockGenerateImageResponse())
      mockExternalStorageServices.uploadFromUrl.mockResolvedValue({
        error: 'Error uploading file from URL',
      })

      const result = await service.generateImages('a sunset', userData, sayMock)

      expect(result).toBe('No se pudo generar la imagen')
      expect(mockImagesDataSource.createImages).not.toHaveBeenCalled()
    })

    it('should return error message when getFileDetails fails', async () => {
      mockImageRepository.generateImage.mockResolvedValue(mockGenerateImageResponse())
      mockExternalStorageServices.uploadFromUrl.mockResolvedValue({
        data: { localId: MOCK_LOCAL_ID, storageFileId: MOCK_STORAGE_FILE_ID },
      })
      mockExternalStorageServices.getFileDetails.mockResolvedValue({
        error: 'File not found',
      })

      const result = await service.generateImages('a sunset', userData, sayMock)

      expect(result).toBe('No se pudo generar la imagen')
      expect(mockImagesDataSource.createImages).not.toHaveBeenCalled()
    })

    it('should return error when image generation returns no images', async () => {
      mockImageRepository.generateImage.mockResolvedValue({ images: [], provider: 'openai' })

      const result = await service.generateImages('a sunset', userData, sayMock)

      expect(result).toBe('No se pudo generar la imagen')
      expect(mockExternalStorageServices.uploadFromUrl).not.toHaveBeenCalled()
    })
  })

  describe('generateImageForAssistant (Assistant/Web flow)', () => {
    const userId = 99
    const mockUser = {
      data: { slackId: 'U789', slackTeamId: 'T012', name: 'assistuser' },
    }

    it('should upload image and return response with persistent URL', async () => {
      mockImageRepository.generateImage.mockResolvedValue(mockGenerateImageResponse())
      mockUsersServices.getUserById.mockResolvedValue(mockUser)
      mockUploadSuccess()
      mockImagesDataSource.createImages.mockResolvedValue(undefined)

      const result = await service.generateImageForAssistant('a cat', userId)

      expect(result).not.toBeNull()
      expect(result?.images[0].url).toBe(MOCK_STORAGE_URL)
      expect(result?.provider).toBe(ImageProvider.OPENAI)
    })

    it('should call uploadFromUrl with options when provided', async () => {
      const options = { size: '1024x1792' as const, quality: 'hd' as const, style: 'vivid' as const }
      mockImageRepository.generateImage.mockResolvedValue(mockGenerateImageResponse())
      mockUsersServices.getUserById.mockResolvedValue(mockUser)
      mockUploadSuccess()
      mockImagesDataSource.createImages.mockResolvedValue(undefined)

      await service.generateImageForAssistant('a cat', userId, options)

      expect(mockExternalStorageServices.uploadFromUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            size: '1024x1792',
            quality: 'hd',
            style: 'vivid',
          }),
        })
      )
    })

    it('should store persistent URL in database', async () => {
      mockImageRepository.generateImage.mockResolvedValue(mockGenerateImageResponse())
      mockUsersServices.getUserById.mockResolvedValue(mockUser)
      mockUploadSuccess()
      mockImagesDataSource.createImages.mockResolvedValue(undefined)

      await service.generateImageForAssistant('a cat', userId)

      expect(mockImagesDataSource.createImages).toHaveBeenCalledWith(
        expect.objectContaining({
          imageUrl: MOCK_STORAGE_URL,
          slackId: 'U789',
          prompt: 'a cat',
        })
      )
    })

    it('should return null when upload fails', async () => {
      mockImageRepository.generateImage.mockResolvedValue(mockGenerateImageResponse())
      mockUsersServices.getUserById.mockResolvedValue(mockUser)
      mockExternalStorageServices.uploadFromUrl.mockResolvedValue({
        error: 'Upload error',
      })

      const result = await service.generateImageForAssistant('a cat', userId)

      expect(result).toBeNull()
      expect(mockImagesDataSource.createImages).not.toHaveBeenCalled()
    })

    it('should return response without upload when user not found', async () => {
      mockImageRepository.generateImage.mockResolvedValue(mockGenerateImageResponse())
      mockUsersServices.getUserById.mockResolvedValue({ data: null })

      const result = await service.generateImageForAssistant('a cat', userId)

      expect(result).not.toBeNull()
      expect(result?.images[0].url).toBe(MOCK_PROVIDER_URL)
      expect(mockExternalStorageServices.uploadFromUrl).not.toHaveBeenCalled()
    })

    it('should return null when generation returns no images', async () => {
      mockImageRepository.generateImage.mockResolvedValue(null)

      const result = await service.generateImageForAssistant('a cat', userId)

      expect(result).toBeNull()
      expect(mockExternalStorageServices.uploadFromUrl).not.toHaveBeenCalled()
    })
  })

  describe('getImages', () => {
    it('should return paginated images', async () => {
      const mockData = { data: [], total: 0, page: 1, pageSize: 10 }
      mockImagesDataSource.getAllImages.mockResolvedValue(mockData)

      const result = await service.getImages(1, 10)

      expect(result.data).toEqual(mockData)
      expect(result.error).toBeUndefined()
    })

    it('should return error on exception', async () => {
      mockImagesDataSource.getAllImages.mockRejectedValue(new Error('DB error'))

      const result = await service.getImages(1, 10)

      expect(result.error).toBe('Error al obtener las imagenes')
    })
  })
})
