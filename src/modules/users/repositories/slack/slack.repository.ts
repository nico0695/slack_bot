import { App as SlackApp } from '@slack/bolt'
import { UsersListResponse } from '@slack/web-api'
import { createModuleLogger } from '../../../../config/logger'
import { connectionSlackApp } from '../../../../config/slackConfig'

const log = createModuleLogger('users.slack')

export default class SlackRepository {
  static #instance: SlackRepository

  #slackApp: SlackApp

  private constructor() {
    this.getTeamMembers = this.getTeamMembers.bind(this)

    this.#slackApp = connectionSlackApp
  }

  static getInstance(): SlackRepository {
    if (this.#instance) {
      return this.#instance
    }

    this.#instance = new SlackRepository()
    return this.#instance
  }

  getTeamMembers = async (teamId: string): Promise<any | null> => {
    try {
      const response: UsersListResponse = await this.#slackApp.client.users.list({
        team_id: teamId,
      })
      return response.members
    } catch (error) {
      log.error({ err: error }, 'Slack API call failed')
      return null
    }
  }

  getUserInfo = async (userId: string): Promise<any | null> => {
    try {
      const response = await this.#slackApp.client.users.info({
        user: userId,
      })

      return response.user
    } catch (error) {
      log.error({ err: error }, 'Slack API call failed')
      return null
    }
  }
}
