import UsersDataSource from '../dataSource/users.dataSource';

import { IUsers } from '../interfaces/users.interfaces';

export default class UsersServices {
  #usersDataSource: UsersDataSource;

  constructor() {
    this.#usersDataSource = new UsersDataSource();

    this.createUser = this.createUser.bind(this);
  }

  /**
   * Create a user with unique email
   * @param dataUser IUsers - Data user
   */
  public async createUser(dataUser: IUsers) {
    try {
      const existEmail = await this.#usersDataSource.existEmail(dataUser.email);

      if (existEmail) {
        return {
          error: 'El email ingresado ya esta en uso',
        };
      }

      const response = await this.#usersDataSource.createUser(dataUser);

      return {
        data: response,
      };
    } catch (error) {
      return {
        error: 'Error al crear el usuario',
      };
    }
  }
}
