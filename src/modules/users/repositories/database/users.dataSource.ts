import { Users } from '../../../../entities/users';

import { IUsers } from '../../interfaces/users.interfaces';

export default class UsersDataSources {
  
  /**
   * Verify if email exist in database
   * @param email string - Email user
   */
  public async existEmail(email: string): Promise<boolean> {
    try {
      const user = await Users.count({ where: { email } });

      if (user > 0) return true;
      return false;
    } catch (error) {
      return error;
    }
  }

  /**
   * Save user in database
   * @param data IUsers - Data user
   * @returns 
   */
  public async createUser(data: IUsers): Promise<Users> {
    try {
      const newUser = new Users();
      newUser.username = data.username;
      newUser.name = data.name;
      newUser.lastName = data.lastName;
      newUser.email = data.email;
      newUser.phone = data.phone;
      newUser.slackId = data.slackId;
      newUser.slackTeamId = data.slackTeamId;

      await newUser.save();

      return newUser;
    } catch (error) {
      return error;
    }
  }

  /**
   * Get user by slackId
   * @param slackId string - Slack Id user
   * @returns IUsers
   */
  public async getUserBySlackId(slackId: string): Promise<IUsers | undefined> {
    try {
      const user = await Users.findOne({ where: { slackId } });

      if (user) {
        const { username, name, lastName, email, phone, slackId, slackTeamId } = user;
        return { username, name, lastName, email, phone, slackId, slackTeamId };
      }

      return undefined;
    } catch (error) {
      return error;
    }
  }

  /**
   * Get users by slackTeamId
   * @param slackTeamId string - Slack Team Id
   * @returns IUsers[]
   */
  public async getUsersBySlackTeamId(slackTeamId: string): Promise<IUsers[]> {
    try {
      const users = await Users.find({ where: { slackTeamId } });

      return users.map(user => {
        const { username, name, lastName, email, phone, slackId, slackTeamId } = user;
        return { username, name, lastName, email, phone, slackId, slackTeamId };
      });
    } catch (error) {
      return error;
    }
  }

  
}
