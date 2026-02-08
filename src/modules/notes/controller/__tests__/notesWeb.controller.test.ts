import BadRequestError from '../../../../shared/utils/errors/BadRequestError'
import NotesWebController from '../notesWeb.controller'

jest.mock('../../../../shared/middleware/auth', () => {
  const identityDecorator = (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ): PropertyDescriptor => descriptor

  return {
    HttpAuth: identityDecorator,
    Permission: () => identityDecorator,
    Profiles: {
      USER: 'USER',
      USER_PREMIUM: 'USER_PREMIUM',
      ADMIN: 'ADMIN',
    },
  }
})

const createNoteMock = jest.fn()
const getNotesByUserIdMock = jest.fn()
const updateNoteMock = jest.fn()
const deleteNoteMock = jest.fn()

const notesServicesMock = {
  createNote: createNoteMock,
  getNotesByUserId: getNotesByUserIdMock,
  updateNote: updateNoteMock,
  deleteNote: deleteNoteMock,
}

jest.mock('../../services/notes.services', () => ({
  __esModule: true,
  default: {
    getInstance: () => notesServicesMock,
  },
}))

describe('NotesWebController', () => {
  let controller: NotesWebController
  let res: any

  beforeEach(() => {
    jest.clearAllMocks()
    controller = NotesWebController.getInstance()
    controller.userData = { id: 11 } as any
    res = { send: jest.fn() }
  })

  describe('createNote', () => {
    it('creates note with default description', async () => {
      const req: any = { body: { title: 'Idea', tag: 'work' } }
      createNoteMock.mockResolvedValue({ data: { id: 1 } })

      await controller.createNote(req, res)

      expect(createNoteMock).toHaveBeenCalledWith({
        title: 'Idea',
        description: '',
        tag: 'work',
        userId: 11,
      })
      expect(res.send).toHaveBeenCalledWith({ id: 1 })
    })

    it('throws BadRequestError when title missing', async () => {
      const req: any = { body: { title: '', tag: 'work' } }

      await expect(controller.createNote(req, res)).rejects.toThrow(BadRequestError)

      expect(createNoteMock).not.toHaveBeenCalled()
    })

    it('throws BadRequestError when service fails', async () => {
      const req: any = { body: { title: 'Note', tag: 'work' } }
      createNoteMock.mockResolvedValue({ error: 'fail' })

      await expect(controller.createNote(req, res)).rejects.toThrow(BadRequestError)
    })
  })

  describe('getNotes', () => {
    it('returns notes collection', async () => {
      const req: any = {}
      const notes = [{ id: 4 }]
      getNotesByUserIdMock.mockResolvedValue({ data: notes })

      await controller.getNotes(req, res)

      expect(getNotesByUserIdMock).toHaveBeenCalledWith(11)
      expect(res.send).toHaveBeenCalledWith(notes)
    })

    it('throws BadRequestError on service error', async () => {
      const req: any = {}
      getNotesByUserIdMock.mockResolvedValue({ error: 'oops' })

      await expect(controller.getNotes(req, res)).rejects.toThrow(BadRequestError)
    })
  })

  describe('updateNote', () => {
    it('updates note when payload valid', async () => {
      const req: any = {
        params: { id: '9' },
        body: { title: 'New', description: 'desc', tag: 'tag' },
      }
      updateNoteMock.mockResolvedValue({ data: true })

      await controller.updateNote(req, res)

      expect(updateNoteMock).toHaveBeenCalledWith(9, {
        id: 9,
        title: 'New',
        description: 'desc',
        tag: 'tag',
        userId: 11,
      })
      expect(res.send).toHaveBeenCalledWith(true)
    })

    it('throws BadRequestError when params id is empty', async () => {
      const req: any = {
        params: { id: '' },
        body: { title: 'Note' },
      }

      await expect(controller.updateNote(req, res)).rejects.toThrow(BadRequestError)

      expect(updateNoteMock).not.toHaveBeenCalled()
    })

    it('throws BadRequestError when title is missing', async () => {
      const req: any = {
        params: { id: '9' },
        body: { title: '', description: '' },
      }

      await expect(controller.updateNote(req, res)).rejects.toThrow(BadRequestError)

      expect(updateNoteMock).not.toHaveBeenCalled()
    })

    it('throws BadRequestError when service fails', async () => {
      const req: any = {
        params: { id: '9' },
        body: { title: 'Title', description: 'desc', tag: 'tag' },
      }
      updateNoteMock.mockResolvedValue({ error: 'fail' })

      await expect(controller.updateNote(req, res)).rejects.toThrow(BadRequestError)
    })
  })

  describe('deleteNote', () => {
    it('returns deletion result', async () => {
      const req: any = { params: { id: '99' } }
      deleteNoteMock.mockResolvedValue({ data: true })

      await controller.deleteNote(req, res)

      expect(deleteNoteMock).toHaveBeenCalledWith(99, 11)
      expect(res.send).toHaveBeenCalledWith(true)
    })

    it('throws BadRequestError when service reports error', async () => {
      const req: any = { params: { id: '99' } }
      deleteNoteMock.mockResolvedValue({ error: 'fail' })

      await expect(controller.deleteNote(req, res)).rejects.toThrow(BadRequestError)
    })
  })
})
