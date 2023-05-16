import { App as SlackApp } from '@slack/bolt';
import { UsersListResponse } from '@slack/web-api';
import { connectionSlackApp } from '../../../../config/slackConfig';

export default class SlackRepository {
  #slackApp: SlackApp;

  constructor() {
    this.getTeamMembers = this.getTeamMembers.bind(this);

    this.#slackApp = connectionSlackApp;
  }

  getTeamMembers = async (teamId: string) => {
    try {
      const response: UsersListResponse =
        await this.#slackApp.client.users.list({
          team_id: teamId,
        });
      return response.members;
    } catch (error) {
      console.log('error= ', error.message);
      return null;
    }
  };
}
