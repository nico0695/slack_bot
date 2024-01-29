import { Users } from '../../../../entities/users'

import { IUsers } from '../../interfaces/users.interfaces'

export default class UsersDataSources {
  static #instance: UsersDataSources

  private constructor() {}

  static getInstance(): UsersDataSources {
    if (this.#instance) {
      return this.#instance
    }

    this.#instance = new UsersDataSources()
    return this.#instance
  }

  /**
   * Verify if email exist in database
   * @param email string - Email user
   */
  public async existEmail(email: string): Promise<boolean> {
    try {
      const user = await Users.count({ where: { email } })

      if (user > 0) return true
      return false
    } catch (error) {
      return error
    }
  }

  /**
   * Save user in database
   * @param data IUsers - Data user
   * @returns
   */
  public async createUser(data: IUsers): Promise<Users> {
    try {
      const newUser = new Users()

      newUser.username = data.username
      newUser.name = data.name
      newUser.lastName = data.lastName
      newUser.email = data.email
      newUser.phone = data.phone
      newUser.slackId = data.slackId
      newUser.slackTeamId = data.slackTeamId
      newUser.supabaseId = data.supabaseId

      await newUser.save()

      return newUser
    } catch (error) {
      return error
    }
  }

  /**
   * Update user by id
   * @param data Partial<IUsers>
   * @returns IUser
   */
  public async updateUserById(id: number, data: Partial<IUsers>): Promise<IUsers | undefined> {
    try {
      await Users.update(id, data)

      const user = await Users.findOne({ where: { id: data.id } })

      return user
    } catch (error) {
      return error
    }
  }

  /**
   * Get user by slackId
   * @param slackId string - Slack Id user
   * @returns IUsers
   */
  public async getUserBySlackId(slackId: string): Promise<IUsers | undefined> {
    try {
      const user = await Users.findOne({ where: { slackId } })

      if (user) {
        return user
      }

      return undefined
    } catch (error) {
      return error
    }
  }

  /**
   * Get users by slackTeamId
   * @param slackTeamId string - Slack Team Id
   * @returns IUsers[]
   */
  public async getUsersBySlackTeamId(slackTeamId: string): Promise<IUsers[]> {
    try {
      const users = await Users.find({ where: { slackTeamId } })

      if (users) {
        return users
      }
    } catch (error) {
      return error
    }
  }

  public async getUserByEmail(email: string): Promise<IUsers | undefined> {
    try {
      const user = await Users.findOne({ where: { email } })

      if (user) {
        return user
      }

      return undefined
    } catch (error) {
      return error
    }
  }
}
