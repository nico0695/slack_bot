import { Notes } from '../../../../../entities/notes'
import NotesDataSource from '../notes.dataSource'

describe('NotesDataSource', () => {
  const dataSource = NotesDataSource.getInstance()

  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe('createNote', () => {
    it('saves note for user', async () => {
      jest.spyOn(Notes.prototype as any, 'save').mockImplementation(
        async function (this: Notes) {
          return this
        }
      )

      const result = await dataSource.createNote({
        userId: 4,
        title: 'Idea',
        description: 'desc',
        tag: 'tag',
      })

      expect(result).toBeInstanceOf(Notes)
      expect(result.user.id).toBe(4)
      expect(result.title).toBe('Idea')
    })

    it('returns error when save fails', async () => {
      const error = new Error('fail')
      jest.spyOn(Notes.prototype as any, 'save').mockRejectedValue(error)

      const result = await dataSource.createNote({
        userId: 1,
        title: 'Idea',
        description: 'desc',
        tag: 'tag',
      })

      expect(result).toBe(error)
    })
  })

  it('retrieves notes filtered by user and options', async () => {
    const notes = [{ id: 1 }] as any
    const findSpy = jest.spyOn(Notes, 'find').mockResolvedValue(notes)

    const result = await dataSource.getNotesByUserId(5, { tag: 'work' })

    expect(findSpy).toHaveBeenCalledWith({
      where: { user: { id: 5 }, tag: 'work' },
    })
    expect(result).toBe(notes)
  })

  it('returns error when fetching notes fails', async () => {
    const error = new Error('fail')
    jest.spyOn(Notes, 'find').mockRejectedValue(error)

    const result = await dataSource.getNotesByUserId(5)

    expect(result).toBe(error)
  })

  it('updates note ignoring user and id fields', async () => {
    const updateSpy = jest.spyOn(Notes, 'update').mockResolvedValue({} as any)

    await dataSource.updateNote(3, {
      id: 3,
      userId: 9,
      title: 'Updated',
      description: 'desc',
    })

    expect(updateSpy).toHaveBeenCalledWith(3, {
      title: 'Updated',
      description: 'desc',
    })
  })

  it('throws formatted error when update fails', async () => {
    jest.spyOn(Notes, 'update').mockRejectedValue(new Error('db'))

    await expect(
      dataSource.updateNote(3, {
        title: 'Updated',
      })
    ).rejects.toThrow('Error al actualizar la tarea')
  })

  describe('deleteNote', () => {
    it('returns affected count', async () => {
      jest.spyOn(Notes, 'delete').mockResolvedValue({ affected: 1 } as any)

      const result = await dataSource.deleteNote(8, 2)

      expect(Notes.delete).toHaveBeenCalledWith({
        id: 8,
        user: { id: 2 },
      })
      expect(result).toBe(1)
    })

    it('returns zero when nothing removed', async () => {
      jest.spyOn(Notes, 'delete').mockResolvedValue({ affected: undefined } as any)

      const result = await dataSource.deleteNote(8, 2)

      expect(result).toBe(0)
    })

    it('throws wrapped error when delete fails', async () => {
      jest.spyOn(Notes, 'delete').mockRejectedValue('boom')

      await expect(dataSource.deleteNote(8, 2)).rejects.toThrow('boom')
    })
  })
})
