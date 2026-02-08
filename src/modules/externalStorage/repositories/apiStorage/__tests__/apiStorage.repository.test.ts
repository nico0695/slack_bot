import axios from 'axios'

jest.mock('axios')
const mockedAxios = axios as jest.Mocked<typeof axios>

const mockLogFns = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
  fatal: jest.fn(),
}

jest.mock('../../../../../config/logger', () => ({
  createModuleLogger: jest.fn().mockReturnValue({
    info: (...args: any[]) => mockLogFns.info(...args),
    error: (...args: any[]) => mockLogFns.error(...args),
    warn: (...args: any[]) => mockLogFns.warn(...args),
    debug: (...args: any[]) => mockLogFns.debug(...args),
    fatal: (...args: any[]) => mockLogFns.fatal(...args),
  }),
}))

const mockClient = {
  post: jest.fn(),
  get: jest.fn(),
  delete: jest.fn(),
}

describe('ApiStorageRepository', () => {
  describe('Environment Variables', () => {
    it('should throw error if STORAGE_API_URL is not defined', () => {
      jest.isolateModules(() => {
        delete process.env.STORAGE_API_URL
        process.env.STORAGE_API_KEY = 'test-key'

        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { default: Repo } = require('../apiStorage.repository')

        expect(() => {
          Repo.getInstance()
        }).toThrow('STORAGE_API_URL is not defined in the environment variables.')
      })
    })

    it('should throw error if STORAGE_API_KEY is not defined', () => {
      jest.isolateModules(() => {
        process.env.STORAGE_API_URL = 'http://localhost:3002'
        delete process.env.STORAGE_API_KEY

        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { default: Repo } = require('../apiStorage.repository')

        expect(() => {
          Repo.getInstance()
        }).toThrow('STORAGE_API_KEY is not defined in the environment variables.')
      })
    })
  })

  describe('with initialized instance', () => {
    let repository: any

    beforeAll(() => {
      process.env.STORAGE_API_URL = 'http://localhost:3002'
      process.env.STORAGE_API_KEY = 'test-api-key'
      mockedAxios.create.mockReturnValue(mockClient as any)

      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const ApiStorageRepository = require('../apiStorage.repository').default
      repository = ApiStorageRepository.getInstance()
    })

    beforeEach(() => {
      jest.clearAllMocks()
    })

    afterAll(() => {
      delete process.env.STORAGE_API_URL
      delete process.env.STORAGE_API_KEY
    })

    describe('Singleton Pattern', () => {
      it('should return the same instance on multiple calls', () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
      const ApiStorageRepository = require('../apiStorage.repository').default
        const instance1 = ApiStorageRepository.getInstance()
        const instance2 = ApiStorageRepository.getInstance()

        expect(instance1).toBe(instance2)
      })
    })

    describe('uploadFile', () => {
      it('should upload file successfully', async () => {
        const mockResponse = {
          data: {
            id: 'storage-123',
            name: 'test.png',
            key: 'images/generated/test.png',
            path: 'images/generated',
            mimeType: 'image/png',
            size: 1024,
            downloadUrl: 'https://storage.example.com/test.png',
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-01T00:00:00Z',
          },
        }

        mockClient.post.mockResolvedValue(mockResponse)

        const buffer = Buffer.from('test-image-data')
        const result = await repository.uploadFile(buffer, 'test.png', {
          path: 'images/generated',
        })

        expect(result).toEqual(mockResponse.data)
        expect(mockClient.post).toHaveBeenCalledWith(
          '/files/upload',
          expect.any(Object),
          expect.objectContaining({
            maxContentLength: Infinity,
            maxBodyLength: Infinity,
          })
        )
      })

      it('should return null on upload error', async () => {
        mockClient.post.mockRejectedValue(new Error('Upload failed'))

        const result = await repository.uploadFile(Buffer.from('data'), 'test.png')

        expect(result).toBeNull()
        expect(mockLogFns.error).toHaveBeenCalledWith(
          { err: expect.any(Error) },
          'uploadFile failed'
        )
      })
    })

    describe('getFile', () => {
      it('should get file details successfully', async () => {
        const mockFile = {
          id: 'storage-123',
          name: 'test.png',
          key: 'images/generated/test.png',
          path: 'images/generated',
          mimeType: 'image/png',
          size: 1024,
          downloadUrl: 'https://storage.example.com/test.png',
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        }

        mockClient.get.mockResolvedValue({ data: mockFile })

        const result = await repository.getFile('storage-123')

        expect(result).toEqual(mockFile)
        expect(mockClient.get).toHaveBeenCalledWith('/files/storage-123')
      })

      it('should return null on error', async () => {
        mockClient.get.mockRejectedValue(new Error('Not found'))

        const result = await repository.getFile('invalid-id')

        expect(result).toBeNull()
        expect(mockLogFns.error).toHaveBeenCalledWith(
          { err: expect.any(Error), fileId: 'invalid-id' },
          'getFile failed'
        )
      })
    })

    describe('listFiles', () => {
      it('should list files with options', async () => {
        const mockResponse = {
          files: [{ id: '1', name: 'test.png' }],
          pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
        }

        mockClient.get.mockResolvedValue({ data: mockResponse })

        const result = await repository.listFiles({
          searchPath: 'images/generated',
          page: 1,
          limit: 10,
        })

        expect(result).toEqual(mockResponse)
        expect(mockClient.get).toHaveBeenCalledWith('/files', {
          params: { searchPath: 'images/generated', page: 1, limit: 10 },
        })
      })

      it('should list files without options', async () => {
        const mockResponse = {
          files: [],
          pagination: { page: 1, limit: 10, total: 0, totalPages: 0 },
        }

        mockClient.get.mockResolvedValue({ data: mockResponse })

        const result = await repository.listFiles()

        expect(result).toEqual(mockResponse)
        expect(mockClient.get).toHaveBeenCalledWith('/files', { params: {} })
      })

      it('should return null on error', async () => {
        mockClient.get.mockRejectedValue(new Error('Server error'))

        const result = await repository.listFiles()

        expect(result).toBeNull()
      })
    })

    describe('deleteFile', () => {
      it('should delete file successfully', async () => {
        mockClient.delete.mockResolvedValue({ data: {} })

        const result = await repository.deleteFile('storage-123')

        expect(result).toBe(true)
        expect(mockClient.delete).toHaveBeenCalledWith('/files/storage-123')
      })

      it('should return false on error', async () => {
        mockClient.delete.mockRejectedValue(new Error('Delete failed'))

        const result = await repository.deleteFile('invalid-id')

        expect(result).toBe(false)
        expect(mockLogFns.error).toHaveBeenCalledWith(
          { err: expect.any(Error), fileId: 'invalid-id' },
          'deleteFile failed'
        )
      })
    })

    describe('downloadFromUrl', () => {
      it('should download file from URL successfully', async () => {
        const mockData = Buffer.from('file-content')
        mockedAxios.get.mockResolvedValue({ data: mockData })

        const result = await repository.downloadFromUrl('https://example.com/image.png')

        expect(result).toBeInstanceOf(Buffer)
        expect(mockedAxios.get).toHaveBeenCalledWith('https://example.com/image.png', {
          responseType: 'arraybuffer',
        })
      })

      it('should return null on download error', async () => {
        mockedAxios.get.mockRejectedValue(new Error('Download failed'))

        const result = await repository.downloadFromUrl('https://invalid.url/file.png')

        expect(result).toBeNull()
        expect(mockLogFns.error).toHaveBeenCalledWith(
          { err: expect.any(Error), url: 'https://invalid.url/file.png' },
          'downloadFromUrl failed'
        )
      })
    })
  })
})
