import { GenericResponse } from '../../../shared/interfaces/services'

import UsersDataSource from '../repositories/database/users.dataSource'

import { IUsers } from '../interfaces/users.interfaces'
import SlackRepository from '../repositories/slack/slack.repository'

export default class UsersServices {
  #usersDataSource: UsersDataSource
  #slackRepository: SlackRepository

  constructor() {
    this.#usersDataSource = new UsersDataSource()
    this.#slackRepository = new SlackRepository()

    this.createUser = this.createUser.bind(this)
  }

  /**
   * Create a user with unique email
   * @param dataUser IUsers - Data user
   */
  public async createUser(dataUser: IUsers): Promise<GenericResponse<IUsers>> {
    try {
      // const existEmail = await this.#usersDataSource.existEmail(dataUser.email);

      // if (existEmail) {
      //   return {
      //     error: 'El email ingresado ya esta en uso',
      //   };
      // }

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
}
