import express from 'express'
import cors from 'cors'
import morgan from 'morgan'

import { App as SlackApp } from '@slack/bolt'

import dotenv from 'dotenv'

import http from 'http'
import { Server } from 'socket.io'

import connectionSource from './config/ormconfig'

import { connectionSlackApp, slackListenersKey } from './config/slackConfig'

import UsersController from './modules/users/controller/users.controller'
import ImagesController from './modules/images/controller/images.controller'
import ConversationController from './modules/conversations/controller/conversations.controller'
import ConversationsSocketController from './modules/conversations/controller/conversationsWeb.controller'
import ImagesWebController from './modules/images/controller/imagesWeb.controller'
import TextToSpeechWebController from './modules/textToSpeech/controller/textToSpeechWeb.controller'

import { IJoinRoomData } from './modules/conversations/shared/interfaces/conversationSocket'

dotenv.config()

const slackPort = 3001

export default class App {
  #app: express.Application
  #slackApp: SlackApp

  #conversationController: ConversationController
  #conversationSocketController: ConversationsSocketController

  #imagesController: ImagesController

  constructor() {
    // Express
    this.#app = express()
    this.#config()
    this.#router()

    // Slack
    this.#slackApp = connectionSlackApp

    this.#conversationController = new ConversationController()
    this.#conversationSocketController = new ConversationsSocketController()
    this.#imagesController = new ImagesController()
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
    this.#app.use('/', [new UsersController().router])
    this.#app.use('/conversations', [new ConversationsSocketController().router])
    this.#app.use('/images', [new ImagesWebController().router])
    this.#app.use('/text-to-speech', [new TextToSpeechWebController().router])
  }

  public async start(): Promise<void> {
    // Socket io
    const server = http.createServer(this.#app)
    const io = new Server(server, {
      cors: {
        origin: 'http://localhost:3000',
      },
    })

    io.on('connection', (socket) => {
      console.log('a user connected: ', socket.id)

      socket.on('join_room', async (data) => {
        const { username, channel }: IJoinRoomData = data // Data sent from client when join_room event emitted

        void socket.join(channel) // Join the user to a socket room

        const joinResponse = await this.#conversationSocketController.joinChannel({
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

        const conversationResponse = await this.#conversationSocketController.generateConversation({
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
    })

    // Start express
    server.listen(this.#app.get('port'), () => {
      console.log('~ Socket Server listening in port 4000!')
    })

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

    this.#slackApp.message('', this.#conversationController.conversationFlow)

    this.#slackApp.message(slackListenersKey.generateImages, this.#imagesController.generateImages)
  }
}
