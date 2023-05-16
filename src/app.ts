import express from 'express';
import cors from 'cors';
import morgan from 'morgan';

import connectionSource from './config/ormconfig';

import UsersController from './modules/users/controller/users.controller';

import { App as SlackApp } from '@slack/bolt';
import OpenaiController from './modules/conversations/controller/conversations.controller';
import { connectionSlackApp, slackListenersKey } from './config/slackConfig';
require('dotenv').config();

const slackPort = 3001;

export default class App {
  #app: express.Application;
  #slackApp: SlackApp;

  #openaiController: OpenaiController;

  constructor() {
    // Express
    this.#app = express();
    this.#config();
    this.#router();

    // Slack
    this.#slackApp = connectionSlackApp;

    this.#openaiController = new OpenaiController();
  }

  #config(): void {
    this.#app.set('port', 3000);

    this.#app.use(morgan('dev'));
    this.#app.use(cors());
    this.#app.use(express.json());

    // Database Conection
    connectionSource.initialize();
  }

  #router(): void {
    this.#app.use('/', [new UsersController().router]);
  }

  public async start(): Promise<void> {
    // Start express
    this.#app.listen(this.#app.get('port'), () => {
      console.log('~ Server listening in port 3000!');
    });

    // Start slack bot
    this.#slackApp.start(process.env.PORT ?? slackPort).then(() => {
      console.log(`~ Slack Bot is running on port ${slackPort}!`);
    });

    // Listener slack bot
    this.#slackApp.message(
      slackListenersKey.generateConversation,
      this.#openaiController.generateConversation
    );
    this.#slackApp.message(
      slackListenersKey.cleanConversation,
      this.#openaiController.cleanConversation
    );
    this.#slackApp.message(
      slackListenersKey.showConversation,
      this.#openaiController.showConversation
    );
  }
}
