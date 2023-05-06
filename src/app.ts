import express from 'express';
import cors from 'cors';
import morgan from 'morgan';

import connectionSource from './config/ormconfig';

import UsersController from './modules/users/controller/users.controller';

import { App as SlackApp } from '@slack/bolt';
import OpenaiController from './modules/conversations/controller/conversations.controller';
require('dotenv').config();

const slackPort = 3001;

export default class App {
  public app: express.Application;
  public slackApp: SlackApp;

  #openaiController: OpenaiController;

  constructor() {
    this.app = express();
    this.#config();
    this.#router();

    // Slack
    this.#startSlackBot();

    this.#openaiController = new OpenaiController();
  }

  #config(): void {
    this.app.set('port', 3000);

    this.app.use(morgan('dev'));
    this.app.use(cors());
    this.app.use(express.json());

    // Database Conection
    connectionSource.initialize();
  }

  #router(): void {
    this.app.use('/', [new UsersController().router]);
  }

  public async start(): Promise<void> {
    // Start express
    this.app.listen(this.app.get('port'), () => {
      console.log('~ Server listening in port 3000!');
    });

    // Start slack bot
    this.slackApp.start(process.env.PORT ?? slackPort).then(() => {
      console.log(`~ Slack Bot is running on port ${slackPort}!`);
    });

    // Listen slack bot
    this.slackApp.message(/^cb?\b/, this.#openaiController.generateConversation);
    this.slackApp.message(/^cb_clean?\b/, this.#openaiController.cleanConversation);
    this.slackApp.message(/^cb_show?\b/, this.#openaiController.showConversation);
  }

  // SLACK BOT
  #startSlackBot(): void {
    // Initializes your app with your bot token and signing secret
    this.slackApp = new SlackApp({
      token: process.env.SLACK_BOT_TOKEN,
      signingSecret: process.env.SLACK_SIGNING_SECRET,
      socketMode: true,
      appToken: process.env.APP_TOKEN,
    });
  }
}
