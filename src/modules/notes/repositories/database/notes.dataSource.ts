import { Notes } from '../../../../entities/notes'
import { Users } from '../../../../entities/users'

import { INote } from '../../shared/interfaces/notes.interfaces'

export default class NotesDataSource {
  static #instance: NotesDataSource

  private constructor() {}

  static getInstance(): NotesDataSource {
    if (this.#instance) {
      return this.#instance
    }

    this.#instance = new NotesDataSource()
    return this.#instance
  }

  /**
   * Save note in database
   * @param data INote
   * @returns
   */
  async createNote(data: INote): Promise<Notes> {
    try {
      const user = new Users()
      user.id = data.userId

      const newNote = new Notes()

      newNote.title = data.title
      newNote.description = data.description
      newNote.tag = data.tag?.trim() ? data.tag.trim() : null
      newNote.user = user

      await newNote.save()

      return newNote
    } catch (error) {
      return error
    }
  }

  /**
   * Get notes by user id
   * @param userId number - User id
   * @returns
   */
  async getNotesByUserId(
    userId: number,
    options?: {
      tag?: string
    }
  ): Promise<Notes[]> {
    try {
      const notes = await Notes.find({
        where: { user: { id: userId }, ...(options ?? {}) },
      })

      return notes
    } catch (error) {
      return error
    }
  }

  async updateNote(noteId: number, dataUpdate: Partial<INote>): Promise<void> {
    try {
      const data = { ...dataUpdate }
      delete data.userId
      delete data.id

      await Notes.update(noteId, data)
    } catch (error) {
      throw new Error('Error al actualizar la tarea')
    }
  }

  async deleteNote(noteId: number, userId: number): Promise<number> {
    try {
      const result = await Notes.delete({
        id: noteId,
        user: { id: userId },
      })
      return result.affected ?? 0
    } catch (error) {
      throw new Error(error)
    }
  }
}
