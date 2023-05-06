import { Users } from '../../../entities/users';

import { IUsers } from '../interfaces/users.interfaces';

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
      newUser.name = data.name;
      newUser.email = data.email;
      newUser.phone = data.phone;

      await newUser.save();

      return newUser;
    } catch (error) {
      return error;
    }
  }
}
