import express from 'express'
import cors from 'cors'
import morgan from 'morgan'

import dotenv from 'dotenv'

import http from 'http'

import { IoServer } from './config/socketConfig'

import connectionSource from './config/ormconfig'

import { App as SlackApp } from '@slack/bolt'
import { connectionSlackApp, slackListenersKey } from './config/slackConfig'

import UsersController from './modules/users/controller/users.controller'
import ImagesController from './modules/images/controller/images.controller'
import ConversationController from './modules/conversations/controller/conversations.controller'
import ConversationsWebController from './modules/conversations/controller/conversationsWeb.controller'
import ImagesWebController from './modules/images/controller/imagesWeb.controller'
import TextToSpeechWebController from './modules/textToSpeech/controller/textToSpeechWeb.controller'

import { IJoinRoomData } from './modules/conversations/shared/interfaces/conversationSocket'
import SummaryWebController from './modules/summary/controller/summary.controller'

dotenv.config()

const slackPort = 3001

export default class App {
  #app: express.Application
  #slackApp: SlackApp

  #usersController: UsersController

  #conversationController: ConversationController
  #conversationWebController: ConversationsWebController

  #imagesController: ImagesController
  #imagesWebController: ImagesWebController

  #textToSpeechWebController: TextToSpeechWebController
  #summaryWebController: SummaryWebController

  constructor() {
    // Express
    this.#app = express()
    this.#config()

    // Slack
    this.#slackApp = connectionSlackApp

    // Web
    this.#usersController = UsersController.getInstance()

    this.#conversationController = ConversationController.getInstance()
    this.#conversationWebController = ConversationsWebController.getInstance()

    this.#imagesController = ImagesController.getInstance()
    this.#imagesWebController = ImagesWebController.getInstance()

    this.#textToSpeechWebController = TextToSpeechWebController.getInstance()
    this.#summaryWebController = SummaryWebController.getInstance()

    this.#router()
  }

  #config(): void {
    this.#app.set('port', 4000)

    this.#app.use(morgan('dev'))
    this.#app.use(cors())
    this.#app.use(express.json())

    // Database Conection
    void connectionSource.initialize()
  }

  #router(): void {
    this.#app.use('/users', [this.#usersController.router])
    this.#app.use('/conversations', [this.#conversationWebController.router])
    this.#app.use('/images', [this.#imagesWebController.router])
    this.#app.use('/text-to-speech', [this.#textToSpeechWebController.router])
    this.#app.use('/summary', [this.#summaryWebController.router])
  }

  #slackListeners(): void {
    // Start slack bot
    void this.#slackApp.start(process.env.PORT ?? slackPort).then(() => {
      console.log(`~ Slack Bot is running on port ${slackPort}!`)
    })

    // Listener slack bot
    this.#slackApp.message(
      slackListenersKey.generateConversation,
      this.#conversationController.generateConversation
    )
    this.#slackApp.message(
      slackListenersKey.cleanConversation,
      this.#conversationController.cleanConversation
    )
    this.#slackApp.message(
      slackListenersKey.showConversation,
      this.#conversationController.showConversation
    )

    this.#slackApp.message(slackListenersKey.generateImages, this.#imagesController.generateImages)

    this.#slackApp.message('', this.#conversationController.conversationFlow)

    this.#slackApp.command('/help', async ({ ack, body, client }: any): Promise<void> => {
      ack('List of commands \n - `-alert/-a` = Generate alert. ex. "-alert 1d14h12m Hello World"')
    })
  }

  #socketListeners(server: http.Server): void {
    let io = IoServer.io

    if (!io) {
      io = IoServer.setServer(server)
    }

    io.on('connection', (socket) => {
      console.log('a user connected: ', socket.id)

      socket.on('join_room', async (data) => {
        const { username, channel }: IJoinRoomData = data

        void socket.join(channel) // Join the user to a socket room

        const joinResponse = await this.#conversationWebController.joinChannel({
          channel,
          username,
        })

        console.log(`user ${username} joined channel ${channel}`)

        socket.emit('join_response', joinResponse) // Send message to user that joined
      })

      socket.on('send_message', async (data) => {
        const { message, username, channel, iaEnabled } = data

        socket.to(channel).emit('receive_message', {
          content: message,
          userSlackId: username,
          role: 'user',
        })

        const conversationResponse = await this.#conversationWebController.generateConversation({
          username,
          channel,
          message,
          iaEnabled,
        })

        if (conversationResponse !== null) {
          io.in(channel).emit('receive_message', conversationResponse) // Send message to all users in channel, including sender
        }
      })

      socket.on('disconnect', (reason) => {
        console.log('user disconnected= ', reason)
      })

      // Assistant
      socket.on('join_assistant_room', async (data) => {
        const { username, channel: channelId }: IJoinRoomData = data

        const channel = channelId.toString().padStart(8, '9')

        void socket.join(channel) // Join the user to a socket room

        const joinResponse = await this.#conversationWebController.joinAssistantChannel({
          username,
          channel,
        })

        socket.emit('join_assistant_response', joinResponse) // Send message to user that joined
      })

      socket.on('send_assistant_message', async (data) => {
        const { message, userId, iaEnabled } = data

        const channel = userId.toString().padStart(8, '9')

        const conversationResponse =
          await this.#conversationWebController.conversationAssistantFlow(
            userId,
            message,
            iaEnabled
          )

        if (conversationResponse !== null) {
          io.in(channel).emit('receive_assistant_message', conversationResponse) // Send message to all users in channel, including sender
        }
      })

      socket.on('leave_assistant_room', async (data) => {
        const { channel: channelId }: IJoinRoomData = data

        const channel = channelId.toString().padStart(8, '9')

        void socket.leave(channel)
      })
    })
  }

  // Start server
  public async start(): Promise<void> {
    const server = http.createServer(this.#app)

    // Socket io
    this.#socketListeners(server)

    // Start express
    server.listen(this.#app.get('port'), () => {
      console.log('~ Socket Server listening in port 4000!')
    })

    // Slack
    this.#slackListeners()
  }
}
