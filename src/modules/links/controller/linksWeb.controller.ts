import { Router } from 'express'

import GenericController from '../../../shared/modules/genericController'
import BadRequestError from '../../../shared/utils/errors/BadRequestError'

import LinksServices from '../services/links.services'

import { ILink } from '../shared/interfaces/links.interfaces'
import { LinkStatus } from '../shared/constants/links.constants'
import { HttpAuth, Permission } from '../../../shared/middleware/auth'
import { Profiles } from '../../../shared/constants/auth.constants'

export default class LinksWebController extends GenericController {
  static #instance: LinksWebController

  public router: Router

  #linksServices: LinksServices

  private constructor() {
    super()
    this.createLink = this.createLink.bind(this)
    this.getLinks = this.getLinks.bind(this)
    this.deleteLink = this.deleteLink.bind(this)
    this.updateLink = this.updateLink.bind(this)

    this.#linksServices = LinksServices.getInstance()

    this.router = Router()
    this.registerRoutes()
  }

  static getInstance(): LinksWebController {
    if (this.#instance) {
      return this.#instance
    }

    this.#instance = new LinksWebController()
    return this.#instance
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

    const dataLink: ILink = {
      url: req.body.url,
      title: req.body.title ?? '',
      description: req.body.description ?? '',
      tag: req.body.tag,
      userId: user.id,
    }

    if (!dataLink.url) {
      throw new BadRequestError({ message: 'Ingrese los datos correctos' })
    }

    const response = await this.#linksServices.createLink(dataLink)

    if (response.error) {
      throw new BadRequestError({ message: response.error })
    }

    res.send(response.data)
  }

  @HttpAuth
  @Permission([Profiles.USER, Profiles.USER_PREMIUM, Profiles.ADMIN])
  public async getLinks(req: any, res: any): Promise<void> {
    const user = this.userData

    const options: { tag?: string; status?: string } = {}
    if (req.query.tag) {
      options.tag = req.query.tag
    }
    if (req.query.status) {
      options.status = req.query.status
    }

    const response = await this.#linksServices.getLinksByUserId(user.id, options)

    if (response.error) {
      throw new BadRequestError({ message: response.error })
    }

    res.send(response.data)
  }

  @HttpAuth
  @Permission([Profiles.USER, Profiles.USER_PREMIUM, Profiles.ADMIN])
  public async updateLink(req: any, res: any): Promise<void> {
    const user = this.userData
    const linkId = req.params.id

    const dataLink: Partial<ILink> = {}

    if (req.body.url !== undefined) dataLink.url = req.body.url
    if (req.body.title !== undefined) dataLink.title = req.body.title
    if (req.body.description !== undefined) dataLink.description = req.body.description
    if (req.body.tag !== undefined) dataLink.tag = req.body.tag
    if (req.body.status !== undefined) {
      const validStatuses = Object.values(LinkStatus)
      if (!validStatuses.includes(req.body.status)) {
        throw new BadRequestError({ message: 'Estado no válido' })
      }
      dataLink.status = req.body.status
    }

    const response = await this.#linksServices.updateLink(linkId, dataLink, user.id)

    if (response.error) {
      throw new BadRequestError({ message: response.error })
    }

    res.send(response.data)
  }

  @HttpAuth
  @Permission([Profiles.USER, Profiles.USER_PREMIUM, Profiles.ADMIN])
  public async deleteLink(req: any, res: any): Promise<void> {
    const user = this.userData

    const response = await this.#linksServices.deleteLink(req.params.id, user.id)

    if (response.error) {
      throw new BadRequestError({ message: response.error })
    }

    res.send(response.data)
  }
}
