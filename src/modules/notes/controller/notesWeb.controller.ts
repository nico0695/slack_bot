import { Router } from 'express'

import GenericController from '../../../shared/modules/genericController'
import BadRequestError from '../../../shared/utils/errors/BadRequestError'

import NotesServices from '../services/notes.services'

import { INote } from '../shared/interfaces/notes.interfaces'
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

    const dataNote: INote = {
      title: req.body.title,
      description: req.body.description ?? '',
      tag: req.body.tag,
      userId: user.id,
    }

    if (!dataNote.title) {
      throw new BadRequestError({ message: 'Ingrese los datos correctos' })
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
    const taskId = req.params.id

    const user = this.userData

    const dataNote: INote = {
      id: req.params.id,
      title: req.body.title,
      description: req.body.description,
      tag: req.body.tag,
      userId: user.id,
    }

    if (!dataNote.id || !dataNote.title) {
      throw new BadRequestError({ message: 'Ingrese los datos correctos' })
    }

    const response = await this.notesServices.updateNote(taskId, dataNote)

    if (response.error) {
      throw new BadRequestError({ message: response.error })
    }

    res.send(response.data)
  }

  @HttpAuth
  @Permission([Profiles.USER, Profiles.USER_PREMIUM, Profiles.ADMIN])
  public async deleteNote(req: any, res: any): Promise<void> {
    const user = this.userData

    const response = await this.notesServices.deleteNote(req.params.id, user.id)

    if (response.error) {
      throw new BadRequestError({ message: response.error })
    }

    res.send(response.data)
  }
}
