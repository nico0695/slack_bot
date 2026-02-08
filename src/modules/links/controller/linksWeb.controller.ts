import { Router } from 'express'

import GenericController from '../../../shared/modules/genericController'
import BadRequestError from '../../../shared/utils/errors/BadRequestError'
import { validateBody, validateQuery, validateParams, idParamSchema } from '../../../shared/utils/validation'

import LinksServices from '../services/links.services'

import { ILink } from '../shared/interfaces/links.interfaces'
import { createLinkSchema, updateLinkSchema, getLinkQuerySchema } from '../shared/schemas/links.schemas'
import { HttpAuth, Permission } from '../../../shared/middleware/auth'
import { Profiles } from '../../../shared/constants/auth.constants'

export default class LinksWebController extends GenericController {
  private static instance: LinksWebController

  public router: Router

  private linksServices: LinksServices

  private constructor() {
    super()
    this.createLink = this.createLink.bind(this)
    this.getLinks = this.getLinks.bind(this)
    this.deleteLink = this.deleteLink.bind(this)
    this.updateLink = this.updateLink.bind(this)

    this.linksServices = LinksServices.getInstance()

    this.router = Router()
    this.registerRoutes()
  }

  static getInstance(): LinksWebController {
    if (this.instance) {
      return this.instance
    }

    this.instance = new LinksWebController()
    return this.instance
  }

  /** Links Routes */

  protected registerRoutes(): void {
    this.router.get('/', this.getLinks)
    this.router.post('/', this.createLink)
    this.router.put('/:id', this.updateLink)
    this.router.delete('/:id', this.deleteLink)
  }

  /** Links Controllers Methods */

  @HttpAuth
  @Permission([Profiles.USER, Profiles.USER_PREMIUM, Profiles.ADMIN])
  public async createLink(req: any, res: any): Promise<void> {
    const user = this.userData
    const parsed = validateBody(createLinkSchema, req.body)

    const dataLink: ILink = {
      url: parsed.url,
      title: parsed.title,
      description: parsed.description,
      tag: parsed.tag,
      userId: user.id,
    }

    const response = await this.linksServices.createLink(dataLink)

    if (response.error) {
      throw new BadRequestError({ message: response.error })
    }

    res.send(response.data)
  }

  @HttpAuth
  @Permission([Profiles.USER, Profiles.USER_PREMIUM, Profiles.ADMIN])
  public async getLinks(req: any, res: any): Promise<void> {
    const user = this.userData
    const options = validateQuery(getLinkQuerySchema, req.query)

    const response = await this.linksServices.getLinksByUserId(user.id, options)

    if (response.error) {
      throw new BadRequestError({ message: response.error })
    }

    res.send(response.data)
  }

  @HttpAuth
  @Permission([Profiles.USER, Profiles.USER_PREMIUM, Profiles.ADMIN])
  public async updateLink(req: any, res: any): Promise<void> {
    const { id: linkId } = validateParams(idParamSchema, req.params)
    const user = this.userData
    const dataLink = validateBody(updateLinkSchema, req.body)

    const response = await this.linksServices.updateLink(linkId, dataLink, user.id)

    if (response.error) {
      throw new BadRequestError({ message: response.error })
    }

    res.send(response.data)
  }

  @HttpAuth
  @Permission([Profiles.USER, Profiles.USER_PREMIUM, Profiles.ADMIN])
  public async deleteLink(req: any, res: any): Promise<void> {
    const { id: linkId } = validateParams(idParamSchema, req.params)
    const user = this.userData

    const response = await this.linksServices.deleteLink(linkId, user.id)

    if (response.error) {
      throw new BadRequestError({ message: response.error })
    }

    res.send(response.data)
  }
}
