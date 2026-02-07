import NotesServices from '../notes.services'

jest.mock('../../../../config/logger', () => ({
  createModuleLogger: jest.fn().mockReturnValue({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    fatal: jest.fn(),
  }),
}))

const createNoteMock = jest.fn()
const getNotesByUserIdMock = jest.fn()
const updateNoteMock = jest.fn()
const deleteNoteMock = jest.fn()

const notesDataSourceInstance = {
  createNote: createNoteMock,
  getNotesByUserId: getNotesByUserIdMock,
  updateNote: updateNoteMock,
  deleteNote: deleteNoteMock,
}

jest.mock('../../repositories/database/notes.dataSource', () => ({
  __esModule: true,
  default: {
    getInstance: () => notesDataSourceInstance,
  },
}))

describe('NotesServices', () => {
  const services = NotesServices.getInstance()

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('createAssistantNote', () => {
    it('delegates creation to repository', async () => {
      const note = { id: 1 }
      createNoteMock.mockResolvedValue(note)

      const result = await services.createAssistantNote(3, 'Title', 'Body', 'tag')

      expect(createNoteMock).toHaveBeenCalledWith({
        userId: 3,
        title: 'Title',
        description: 'Body',
        tag: 'tag',
      })
      expect(result).toEqual({ data: note })
    })

    it('omits tag when value is empty', async () => {
      const note = { id: 2 }
      createNoteMock.mockResolvedValue(note)

      await services.createAssistantNote(3, 'Title', 'Body', '   ')

      expect(createNoteMock).toHaveBeenCalledWith({
        userId: 3,
        title: 'Title',
        description: 'Body',
      })
    })

    it('returns error when datasource throws', async () => {
      createNoteMock.mockRejectedValue(new Error('fail'))

      const result = await services.createAssistantNote(3, 'Title', 'Body', 'tag')

      expect(result.error).toBe('Error al crear la tarea')
    })
  })

  it('creates note directly', async () => {
    createNoteMock.mockResolvedValue({ id: 2 })

    const result = await services.createNote({
      userId: 1,
      title: 'Note',
      description: '',
      tag: 'tag',
    })

    expect(result).toEqual({ data: { id: 2 } })
  })

  it('returns error when direct creation fails', async () => {
    createNoteMock.mockRejectedValue(new Error('fail'))

    const result = await services.createNote({
      userId: 1,
      title: 'Note',
      description: '',
      tag: 'tag',
    })

    expect(result.error).toBe('Error al crear la tarea')
  })

  describe('getNotesByUserId', () => {
    it('returns notes when repository succeeds', async () => {
      const notes = [{ id: 1 }]
      getNotesByUserIdMock.mockResolvedValue(notes)

      const result = await services.getNotesByUserId(5, { tag: 'work' })

      expect(getNotesByUserIdMock).toHaveBeenCalledWith(5, { tag: 'work' })
      expect(result).toEqual({ data: notes })
    })

    it('returns error when repository fails', async () => {
      getNotesByUserIdMock.mockRejectedValue(new Error('fail'))

      const result = await services.getNotesByUserId(5)

      expect(result.error).toBe('Error al obtener las tareas')
    })
  })

  describe('updateNote', () => {
    it('returns success when update completes', async () => {
      updateNoteMock.mockResolvedValue(undefined)

      const result = await services.updateNote(9, { title: 'New' })

      expect(updateNoteMock).toHaveBeenCalledWith(9, { title: 'New' })
      expect(result).toEqual({ data: true })
    })

    it('returns error when update fails', async () => {
      updateNoteMock.mockRejectedValue(new Error('fail'))

      const result = await services.updateNote(9, { title: 'New' })

      expect(result.error).toBe('Error al actualizar la tarea')
    })
  })

  describe('deleteNote', () => {
    it('maps repository response to boolean', async () => {
      deleteNoteMock.mockResolvedValueOnce(1).mockResolvedValueOnce(0)

      const success = await services.deleteNote(4, 2)
      const failure = await services.deleteNote(4, 2)

      expect(success).toEqual({ data: true })
      expect(failure).toEqual({ data: false })
    })

    it('returns error when deletion fails', async () => {
      deleteNoteMock.mockRejectedValue(new Error('fail'))

      const result = await services.deleteNote(4, 2)

      expect(result.error).toBe('Error al eliminar la tarea')
    })
  })
})
