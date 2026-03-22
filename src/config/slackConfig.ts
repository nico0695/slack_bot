import { App as SlackApp } from '@slack/bolt'
import dotenv from 'dotenv'

dotenv.config()

// Initialize the Slack app
export const connectionSlackApp = new SlackApp({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  socketMode: true,
  appToken: process.env.APP_TOKEN,
})

// Regex patterns for Slack messages
export const slackListenersKey = {
  generateConversation: /^cb?\b/i,
  cleanConversation: /^cb_clean?\b/i,
  showConversation: /^cb_show?\b/i,

  generateImages: /^img?\b/i,

  generateQr: /^qr?\b/i,

  conversationFlow: /^(?!img|qr|cb_clean|cb_show|cb\b)/i,
}
