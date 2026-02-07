import { Notes } from '../../../entities/notes'
import { GenericResponse } from '../../../shared/interfaces/services'

import NotesDataSource from '../repositories/database/notes.dataSource'

import { INote } from '../shared/interfaces/notes.interfaces'
import { createModuleLogger } from '../../../config/logger'

const log = createModuleLogger('notes.service')

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
    description: string,
    tag?: string,
    channelId?: string
  ): Promise<GenericResponse<Notes>> {
    try {
      const sanitizedTag = tag?.trim()
      const payload: INote = {
        userId,
        title,
        description,
      }

      if (sanitizedTag && sanitizedTag.length > 0) {
        payload.tag = sanitizedTag
      }

      if (channelId) {
        payload.channelId = channelId
      }

      const response = await this.#notesDataSource.createNote(payload)

      log.info({ userId, noteId: response.id }, 'Note created')

      return {
        data: response,
      }
    } catch (error) {
      log.error({ err: error, userId }, 'createAssistantNote failed')
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

      log.info({ userId: data.userId, noteId: response.id }, 'Note created')

      return {
        data: response,
      }
    } catch (error) {
      log.error({ err: error, userId: data.userId }, 'createNote failed')
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
  public async getNotesByUserId(
    userId: number,
    options?: {
      tag?: string
      channelId?: string | null
    }
  ): Promise<GenericResponse<Notes[]>> {
    try {
      const response = await this.#notesDataSource.getNotesByUserId(userId, options)

      return {
        data: response,
      }
    } catch (error) {
      log.error({ err: error, userId }, 'getNotesByUserId failed')
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
      log.error({ err: error, noteId }, 'updateNote failed')
      return {
        error: 'Error al actualizar la tarea',
      }
    }
  }

  public async deleteNote(noteId: number, userId: number): Promise<GenericResponse<boolean>> {
    try {
      const res = await this.#notesDataSource.deleteNote(noteId, userId)

      log.info({ noteId, userId }, 'Note deleted')

      return {
        data: res > 0,
      }
    } catch (error) {
      log.error({ err: error, noteId, userId }, 'deleteNote failed')
      return {
        error: 'Error al eliminar la tarea',
      }
    }
  }
}
