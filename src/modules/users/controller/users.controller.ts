/* eslint-disable @typescript-eslint/no-misused-promises */
import { Router } from 'express'

import UsersServices from '../services/users.services'

import { IUsers } from '../interfaces/users.interfaces'
import { HttpAuth, Permission } from '../../../shared/middleware/auth'
import { Profiles } from '../../../shared/constants/auth.constants'

export default class UsersController {
  static #instance: UsersController

  public router: Router

  #usersServices: UsersServices

  private constructor() {
    this.createUser = this.createUser.bind(this)
    this.getUsers = this.getUsers.bind(this)

    this.#usersServices = UsersServices.getInstance()

    this.router = Router()
    this.registerRoutes()
  }

  static getInstance(): UsersController {
    if (this.#instance) {
      return this.#instance
    }

    this.#instance = new UsersController()
    return this.#instance
  }

  /** Users Routes */

  protected registerRoutes(): void {
    this.router.get('/', this.getUsers)
    this.router.post('/create_user', this.createUser)
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
    }

    if (!dataUser.name || !dataUser.email || !dataUser.phone) {
      res.status(400).send({ message: 'Ingrese los datos correctos' })
      return
    }

    const response = await this.#usersServices.createUser(dataUser)

    if (response.error) {
      res.status(400).send({ message: response.error })
      return
    }

    res.send(response.data)
  }

  @HttpAuth
  @Permission([Profiles.ADMIN])
  public async getUsers(req: any, res: any, _next: any): Promise<void> {
    const {
      query: { page = 1, pageSize = 6 },
    } = req

    try {
      const pageInt = parseInt(page, 10)
      const sizeInt = parseInt(pageSize, 10)

      const response = await this.#usersServices.getUsers(pageInt, sizeInt)

      if (response.error) res.status(500).send(response)

      res.status(200).send(response.data)
    } catch (error) {
      res.status(500).send({ error: error.message })
    }
  }
}
