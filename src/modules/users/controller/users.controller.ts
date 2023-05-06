import { Router } from 'express';

import UsersServices from '../services/users.services';

import { IUsers } from '../interfaces/users.interfaces';

export default class UsersController {
  public router: Router;

  #usersServices: UsersServices;

  constructor() {
    this.createUser = this.createUser.bind(this);

    this.#usersServices = new UsersServices();

    this.router = Router();
    this.registerRoutes();
  }

  /** Users Routes */
  
  protected registerRoutes(): void {
    this.router.post('/create_user', this.createUser);
  }

  /** Users Controllers Methods */

  public async createUser(req: any, res: any) {
    const dataUser: IUsers = {
      name: req.body.name,
      email: req.body.email,
      phone: req.body.phone,
    };

    if (!dataUser.name || !dataUser.email || !dataUser.phone) {
      res.status(400).send({ message: 'Ingrese los datos correctos' });
      return;
    }

    const response = await this.#usersServices.createUser(dataUser);

    if (response.error) {
      res.status(400).send({ message: response.error });
      return;
    }

    res.send(response.data);
  }
}
