import { Router } from 'express';

import ConversationsServices from '../services/conversations.services';
import { roleTypes } from '../shared/constants/openai';
import { IConversation } from '../shared/interfaces/converstions';

export default class ConversationsController {
  public router: Router;

  #openaiServices: ConversationsServices;

  constructor() {
    this.#openaiServices = new ConversationsServices();

    this.generateConversation = this.generateConversation.bind(this);
    this.cleanConversation = this.cleanConversation.bind(this);
    this.showConversation = this.showConversation.bind(this);

    // this.router = Router();
    // this.registerRoutes();
  }

  /** Users Routes */

  //   protected registerRoutes(): void {
  //     this.router.post('/create_user', this.createUser);
  //   }

  /** Users Controllers Methods */

  /**
   *
   * @param data slack response
   */
  public generateConversation = async (data: any) => {
    console.log('### generateConversation ###');
    const { payload, say }: any = data;

    try {
      const newMessage: string = payload.text.replace('cb', '').trimStart();

      const newMessageFormated: IConversation = {
        role: roleTypes.user,
        content: newMessage,
      };

      const newResponse = await this.#openaiServices.generateConversation(
        newMessageFormated,
        payload.user,
        payload.channel
      );

      say(newResponse);
    } catch (error) {
      console.log('err= ', error);
    }
  };

  /**
   * Clean conversation
   * @param data slack response
   */
  public cleanConversation = async (data: any) => {
    console.log(`### cleanConversation ###`);
    const { payload, say }: any = data;

    try {
      const message: string = payload.text;

      if (message !== 'clean_cb') {
        const newResponse = await this.#openaiServices.cleanConversation(
          payload.user,
          payload.channel
        );

        console.log('newResponse= ', newResponse);
        say('Se borro la conversación con éxito 🎉');
      }
    } catch (error) {
      console.log('err= ', error);
    }
  };

  /**
   * Clean conversation
   * @param data slack response
   */
  public showConversation = async (data: any) => {
    console.log('### showConversation ###');
    const { payload, say }: any = data;

    try {
      const message: string = payload.text;

      if (message !== 'clean_cb') {
        const conversaion = await this.#openaiServices.showConversation(
          payload.user,
          payload.channel
        );

        say(conversaion ?? 'No hay ninguna conversación guardada 🤷‍♂️');
      }
    } catch (error) {
      console.log('err= ', error);
    }
  };
}
