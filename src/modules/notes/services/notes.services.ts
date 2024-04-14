import { Notes } from '../../../entities/notes'
import { GenericResponse } from '../../../shared/interfaces/services'

import NotesDataSource from '../repositories/database/notes.dataSource'

import { INote } from '../shared/interfaces/notes.interfaces'

export default class NotesServices {
  static #instance: NotesServices

  #notesDataSource: NotesDataSource

  private constructor() {
    this.#notesDataSource = NotesDataSource.getInstance()
  }

  static getInstance(): NotesServices {
    if (this.#instance) {
      return this.#instance
    }

    this.#instance = new NotesServices()
    return this.#instance
  }

  /**
   * Create note with user assistant data
   * @param userId
   * @param dateText
   * @param message
   * @returns
   */
  public async createAssistantNote(
    userId: number,
    title: string,
    description: string
  ): Promise<GenericResponse<Notes>> {
    try {
      const response = await this.#notesDataSource.createNote({
        userId,
        title,
        description,
      })

      return {
        data: response,
      }
    } catch (error) {
      return {
        error: 'Error al crear la tarea',
      }
    }
  }

  /**
   * Save note in database
   * @param data INote
   * @returns
   */
  public async createNote(data: INote): Promise<GenericResponse<Notes>> {
    try {
      const response = await this.#notesDataSource.createNote(data)

      return {
        data: response,
      }
    } catch (error) {
      return {
        error: 'Error al crear la tarea',
      }
    }
  }

  /**
   * Get notes by user id
   * @param userId number - User id
   * @returns
   */
  public async getNotesByUserId(userId: number): Promise<GenericResponse<Notes[]>> {
    try {
      const response = await this.#notesDataSource.getNotesByUserId(userId)

      return {
        data: response,
      }
    } catch (error) {
      return {
        error: 'Error al obtener las tareas',
      }
    }
  }

  public async updateNote(
    noteId: number,
    dataUpdate: Partial<INote>
  ): Promise<GenericResponse<boolean>> {
    try {
      await this.#notesDataSource.updateNote(noteId, dataUpdate)

      return {
        data: true,
      }
    } catch (error) {
      return {
        error: 'Error al actualizar la tarea',
      }
    }
  }

  public async deleteNote(noteId: number, userId: number): Promise<GenericResponse<boolean>> {
    try {
      await this.#notesDataSource.deleteNote(noteId, userId)

      return {
        data: true,
      }
    } catch (error) {
      return {
        error: 'Error al eliminar la tarea',
      }
    }
  }
}
