import { Router } from 'express'

import GenericController from '../../../shared/modules/genericController'

import UsersServices from '../services/users.services'

import { IUsers } from '../interfaces/users.interfaces'
import { HttpAuth, Permission } from '../../../shared/middleware/auth'
import { Profiles } from '../../../shared/constants/auth.constants'
import BadRequestError from '../../../shared/utils/errors/BadRequestError'

export default class UsersController extends GenericController {
  private static instance: UsersController

  public router: Router

  private usersServices: UsersServices

  private constructor() {
    super()
    this.createUser = this.createUser.bind(this)
    this.getUsers = this.getUsers.bind(this)
    this.getUserMe = this.getUserMe.bind(this)
    this.getUserById = this.getUserById.bind(this)
    this.updateUser = this.updateUser.bind(this)
    this.subscribeNotifications = this.subscribeNotifications.bind(this)

    this.usersServices = UsersServices.getInstance()

    this.router = Router()
    this.registerRoutes()
  }

  static getInstance(): UsersController {
    if (this.instance) {
      return this.instance
    }

    this.instance = new UsersController()
    return this.instance
  }

  /** Users Routes */

  protected registerRoutes(): void {
    this.router.get('/', this.getUsers)
    this.router.get('/me', this.getUserMe)
    this.router.post('/subscribe_notifications', this.subscribeNotifications)
    this.router.post('/create_user', this.createUser)
    this.router.get('/:id', this.getUserById)
    this.router.put('/:id', this.updateUser)
  }

  /** Users Controllers Methods */

  @HttpAuth
  @Permission([Profiles.ADMIN])
  public async createUser(req: any, res: any): Promise<void> {
    const dataUser: IUsers = {
      username: req.body.username,
      name: req.body.name,
      lastName: req.body.lastName,
      email: req.body.email,
      phone: req.body.phone,
      enabled: false, // ? set enabled to false by default
    }

    if (!dataUser.name || !dataUser.email || !dataUser.phone) {
      throw new BadRequestError({ message: 'Ingrese los datos correctos' })
    }

    const response = await this.usersServices.createUser(dataUser)

    if (response.error) {
      throw new BadRequestError({ message: response.error })
    }

    res.send(response.data)
  }

  @HttpAuth
  @Permission([Profiles.ADMIN])
  public async getUsers(req: any, res: any): Promise<void> {
    const {
      query: { page = 1, pageSize = 6 },
    } = req

    const pageInt = parseInt(page, 10)
    const sizeInt = parseInt(pageSize, 10)

    const response = await this.usersServices.getUsers(pageInt, sizeInt)

    if (response.error) {
      throw new BadRequestError({ message: response.error })
    }

    res.status(200).send(response.data)
  }

  @HttpAuth
  public async getUserMe(req: any, res: any): Promise<void> {
    const user = this.userData

    res.status(200).send(user)
  }

  @HttpAuth
  @Permission([Profiles.ADMIN])
  public async getUserById(req: any, res: any): Promise<void> {
    const {
      params: { id },
    } = req

    const response = await this.usersServices.getUserById(parseInt(id, 10))

    if (response.error) {
      throw new BadRequestError({ message: response.error })
    }

    res.status(200).send(response.data)
  }

  @HttpAuth
  @Permission([Profiles.ADMIN])
  public async updateUser(req: any, res: any): Promise<void> {
    const {
      params: { id },
    } = req

    const dataUser: IUsers = {
      username: req.body.username,
      name: req.body.name,
      lastName: req.body.lastName,
      email: req.body.email,
      phone: req.body.phone,
      enabled: req.body.enabled,
      profile: req.body.profile,
    }

    if (!dataUser.name || !dataUser.email) {
      throw new BadRequestError({ message: 'Datos incorrectos' })
    }

    const response = await this.usersServices.updateUserById(parseInt(id, 10), dataUser)

    if (response.error) {
      throw new BadRequestError({ message: response.error })
    }

    res.send(response.data)
  }

  @HttpAuth
  public async subscribeNotifications(req: any, res: any): Promise<void> {
    const subscription = req.body

    const user = this.userData

    const response = await this.usersServices.subscribeNotifications(user.id, subscription)

    if (response.error) {
      throw new BadRequestError({ message: response.error })
    }

    res.send(response.data)
  }
}
