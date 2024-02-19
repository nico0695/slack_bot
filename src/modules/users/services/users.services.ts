import { GenericResponse } from '../../../shared/interfaces/services'

import UsersDataSource from '../repositories/database/users.dataSource'

import { IUsers } from '../interfaces/users.interfaces'
import SlackRepository from '../repositories/slack/slack.repository'
import { UsersRedis } from '../repositories/redis/users.redis'

import { IPaginationResponse, IPaginationOptions } from '../../../shared/interfaces/pagination'

export default class UsersServices {
  static #instance: UsersServices

  #usersDataSource: UsersDataSource
  #slackRepository: SlackRepository
  #userRedis: UsersRedis

  private constructor() {
    this.#usersDataSource = UsersDataSource.getInstance()
    this.#slackRepository = SlackRepository.getInstance()
    this.#userRedis = UsersRedis.getInstance()

    this.createUser = this.createUser.bind(this)
  }

  static getInstance(): UsersServices {
    if (this.#instance) {
      return this.#instance
    }

    this.#instance = new UsersServices()
    return this.#instance
  }

  /**
   * Create a user with unique email
   * @param dataUser IUsers - Data user
   */
  public async createUser(dataUser: IUsers): Promise<GenericResponse<IUsers>> {
    try {
      const existEmail = await this.#usersDataSource.existEmail(dataUser.email)

      if (existEmail) {
        return {
          error: 'El email ingresado ya esta en uso',
        }
      }

      const response = await this.#usersDataSource.createUser(dataUser)

      return {
        data: response,
      }
    } catch (error) {
      return {
        error: 'Error al crear el usuario',
      }
    }
  }

  public async getUserByEmail(email: string): Promise<GenericResponse<IUsers>> {
    try {
      const userDb = await this.#usersDataSource.getUserByEmail(email)

      if (userDb !== undefined) {
        return { data: userDb }
      }

      return {
        error: 'Usuario no encontrado',
      }
    } catch (error) {
      return {
        error: 'Error al recuperar el usuario',
      }
    }
  }

  public async getUserById(id: number): Promise<GenericResponse<IUsers>> {
    try {
      const userDb = await this.#usersDataSource.getUserById(id)

      if (userDb !== undefined) {
        return { data: userDb }
      }

      return {
        error: 'Usuario no encontrado',
      }
    } catch (error) {
      return {
        error: 'Error al recuperar el usuario',
      }
    }
  }

  public async getOrCreateUserSupabase({
    email,
    supabaseId,
  }: {
    email: string
    supabaseId: string
  }): Promise<GenericResponse<IUsers>> {
    try {
      const userDb = await this.#usersDataSource.getUserByEmail(email)

      if (userDb !== undefined) {
        if (userDb.supabaseId === null || userDb.supabaseId !== supabaseId) {
          const responseUpdateUser = await this.#usersDataSource.updateUserById(userDb.id, {
            supabaseId,
          })

          return { data: responseUpdateUser }
        }

        return { data: userDb }
      }

      const newUser: IUsers = {
        username: email.split('@')[0],
        name: email.split('@')[0],
        lastName: '',
        email,
        phone: '',
        supabaseId,
        enabled: false,
      }

      const responseCreateUser = await this.#usersDataSource.createUser(newUser)

      if (responseCreateUser) {
        return {
          data: responseCreateUser,
        }
      }

      return {
        error: 'Error al crear el usuario',
      }
    } catch (error) {
      return {
        error: 'Error al crear el usuario',
      }
    }
  }

  public async updateUserById(
    id: number,
    data: Partial<IUsers>
  ): Promise<GenericResponse<IUsers | undefined>> {
    try {
      const userDb = await this.#usersDataSource.getUserById(id)

      if (userDb === undefined) {
        return {
          error: 'Usuario no encontrado',
        }
      }

      const response = await this.#usersDataSource.updateUserById(id, data)

      return {
        data: response,
      }
    } catch (error) {
      return {
        error: 'Error al actualizar el usuario',
      }
    }
  }

  public async getUsersByTeamId(teamId: string): Promise<GenericResponse<IUsers[]>> {
    try {
      /** Get User from database */
      const usersDb = await this.#usersDataSource.getUsersBySlackTeamId(teamId)

      if (usersDb.length > 0) {
        return { data: usersDb }
      }

      /** if users team is empty get users team from Slack */
      const teamMembers = await this.#slackRepository.getTeamMembers(teamId)

      /** save and return new users */
      const members: IUsers[] = []

      for await (const member of teamMembers) {
        const userDb = await this.#usersDataSource.getUserBySlackId(member.id)
        if (userDb === undefined) {
          const newUser: IUsers = {
            username: member.name,
            name: member.profile.first_name,
            lastName: member.profile.last_name,
            email: member.profile.email,
            phone: '',
            slackId: member.id,
            slackTeamId: member.team_id,
            enabled: false,
          }

          const responseCreateUser = await this.createUser(newUser)
          if (responseCreateUser?.data !== undefined) {
            members.push(responseCreateUser.data)
          }
        }
      }

      return { data: members }
    } catch (error) {
      return {
        error: 'Error al recuperar los usuarios del equipo',
      }
    }
  }

  // Push Notifications
  public async subscribeNotifications(
    userId: number,
    subscription: any
  ): Promise<GenericResponse<boolean>> {
    try {
      const userDb = await this.#usersDataSource.getUserById(userId)

      if (userDb === undefined) {
        return {
          error: 'Usuario no encontrado',
        }
      }

      const response = await this.#userRedis.addOrUpdateUserSubscription(userId, subscription)

      if (!response) {
        throw new Error('Error al suscribir al usuario')
      }

      return {
        data: response,
      }
    } catch (error) {
      return {
        error: 'Error al suscribir al usuario',
      }
    }
  }

  // Admin users
  public async getUsers(
    page: number,
    pageSize: number
  ): Promise<GenericResponse<IPaginationResponse<IUsers>>> {
    try {
      const options: IPaginationOptions = {
        page,
        pageSize,
      }

      const usersDb = await this.#usersDataSource.getAllUsers(options)

      return { data: usersDb }
    } catch (error) {
      return {
        error: 'Error al recuperar los usuarios',
      }
    }
  }

  // get or create user by user slack id
  public async getOrCreateUserBySlackId(
    slackId: string,
    channelId?: string
  ): Promise<GenericResponse<IUsers>> {
    try {
      const userDb = await this.#usersDataSource.getUserBySlackId(slackId)

      if (userDb) {
        // If user exist in database without channel id update channel id
        if (channelId && userDb.slackChannelId !== channelId) {
          const responseUpdateUser = await this.#usersDataSource.updateUserById(userDb.id, {
            slackChannelId: channelId,
          })

          return { data: responseUpdateUser }
        }

        return { data: userDb }
      }

      // If user not exist in database get user from slack and create user
      const userSlack = await this.#slackRepository.getUserInfo(slackId)

      if (!userSlack) {
        return {
          error: 'Error al crear el usuario',
        }
      }

      // Check if user exist in database by email
      const user = await this.#usersDataSource.getUserByEmail(userSlack.profile.email)

      if (user) {
        const responseUpdateUser = await this.#usersDataSource.updateUserById(user.id, {
          slackId,
          slackTeamId: userSlack.team_id,
          image: userSlack.profile.image_original,
        })

        return { data: responseUpdateUser }
      }

      // Create user
      const newUser: IUsers = {
        username: userSlack.name,
        name: userSlack.profile.first_name,
        lastName: userSlack.profile.last_name,
        email: userSlack.profile.email,
        phone: '',
        slackId,
        slackTeamId: userSlack.team_id,
        enabled: true,
      }

      if (channelId) {
        newUser.slackChannelId = channelId
      }

      const responseCreateUser = await this.createUser(newUser)

      if (responseCreateUser?.data !== undefined) {
        return { data: responseCreateUser.data }
      }
    } catch (error) {
      return {
        error: 'Error al recuperar el usuario',
      }
    }
  }
}
