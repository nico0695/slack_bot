import { App as SlackApp } from '@slack/bolt';
require('dotenv').config();

// Initializes your app with your bot token and signing secret
export const connectionSlackApp = new SlackApp({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  socketMode: true,
  appToken: process.env.APP_TOKEN,
});

// Regex to listen slack messages
export const slackListenersKey = {
  generateConversation: /^cb?\b/,
  cleanConversation: /^cb_clean?\b/,
  showConversation: /^cb_show?\b/,
};
