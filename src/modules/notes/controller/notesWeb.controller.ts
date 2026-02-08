import { Router } from 'express'

import GenericController from '../../../shared/modules/genericController'
import BadRequestError from '../../../shared/utils/errors/BadRequestError'
import { validateBody, validateParams, idParamSchema } from '../../../shared/utils/validation'

import NotesServices from '../services/notes.services'

import { INote } from '../shared/interfaces/notes.interfaces'
import { createNoteSchema, updateNoteSchema } from '../shared/schemas/notes.schemas'
import { HttpAuth, Permission } from '../../../shared/middleware/auth'
import { Profiles } from '../../../shared/constants/auth.constants'

export default class NotesWebController extends GenericController {
  private static instance: NotesWebController

  public router: Router

  private notesServices: NotesServices

  private constructor() {
    super()
    this.createNote = this.createNote.bind(this)
    this.getNotes = this.getNotes.bind(this)
    this.deleteNote = this.deleteNote.bind(this)
    this.updateNote = this.updateNote.bind(this)

    this.notesServices = NotesServices.getInstance()

    this.router = Router()
    this.registerRoutes()
  }

  static getInstance(): NotesWebController {
    if (this.instance) {
      return this.instance
    }

    this.instance = new NotesWebController()
    return this.instance
  }

  /** Notes Routes */

  protected registerRoutes(): void {
    this.router.get('/', this.getNotes)
    this.router.post('/', this.createNote)
    this.router.put('/:id', this.updateNote)
    this.router.delete('/:id', this.deleteNote)
  }

  /** Notes Controllers Methods */

  @HttpAuth
  @Permission([Profiles.USER, Profiles.USER_PREMIUM, Profiles.ADMIN])
  public async createNote(req: any, res: any): Promise<void> {
    const user = this.userData
    const parsed = validateBody(createNoteSchema, req.body)

    const dataNote: INote = {
      title: parsed.title,
      description: parsed.description,
      tag: parsed.tag,
      userId: user.id,
    }

    const response = await this.notesServices.createNote(dataNote)

    if (response.error) {
      throw new BadRequestError({ message: response.error })
    }

    res.send(response.data)
  }

  @HttpAuth
  @Permission([Profiles.USER, Profiles.USER_PREMIUM, Profiles.ADMIN])
  public async getNotes(req: any, res: any): Promise<void> {
    const user = this.userData

    const response = await this.notesServices.getNotesByUserId(user.id)

    if (response.error) {
      throw new BadRequestError({ message: response.error })
    }

    res.send(response.data)
  }

  @HttpAuth
  @Permission([Profiles.USER, Profiles.USER_PREMIUM, Profiles.ADMIN])
  public async updateNote(req: any, res: any): Promise<void> {
    const { id: noteId } = validateParams(idParamSchema, req.params)
    const user = this.userData
    const parsed = validateBody(updateNoteSchema, req.body)

    const dataNote: INote = {
      id: noteId,
      title: parsed.title,
      description: parsed.description,
      tag: parsed.tag,
      userId: user.id,
    }

    const response = await this.notesServices.updateNote(noteId, dataNote)

    if (response.error) {
      throw new BadRequestError({ message: response.error })
    }

    res.send(response.data)
  }

  @HttpAuth
  @Permission([Profiles.USER, Profiles.USER_PREMIUM, Profiles.ADMIN])
  public async deleteNote(req: any, res: any): Promise<void> {
    const { id: noteId } = validateParams(idParamSchema, req.params)
    const user = this.userData

    const response = await this.notesServices.deleteNote(noteId, user.id)

    if (response.error) {
      throw new BadRequestError({ message: response.error })
    }

    res.send(response.data)
  }
}
