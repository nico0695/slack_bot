import express from 'express'
import cors from 'cors'
import morgan from 'morgan'

import connectionSource from './config/ormconfig'

import UsersController from './modules/users/controller/users.controller'

import { App as SlackApp } from '@slack/bolt'
import ConversationController from './modules/conversations/controller/conversations.controller'
import ImagesController from './modules/images/controller/images.controller'
import { connectionSlackApp, slackListenersKey } from './config/slackConfig'
import dotenv from 'dotenv'

import http from 'http'
import { Server } from 'socket.io'
import ConversationsSocketController from './modules/conversations/controller/conversationsSocket.controller'

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

      // void socket.join('clock-room')
      socket.on('join_room', async (data) => {
        console.log('JOIN ROOM')
        const { username, room }: { username: string; room: string } = data // Data sent from client when join_room event emitted

        void socket.join(room) // Join the user to a socket room

        const joinResponse = await this.#conversationSocketController.joinChannel({
          channel: room,
          username,
        })

        socket.emit('join_response', joinResponse) // Send message to user that joined
      })

      socket.on('send_message', async (data) => {
        const { message, username, room } = data

        socket.to(room).emit('receive_message', {
          content: message,
          username,
          role: 'user',
        })

        const conversationResponse = await this.#conversationSocketController.generateConversation({
          username,
          channel: room,
          message,
        })

        io.in(room).emit('receive_message', conversationResponse) // Send to all users in room, including sender
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
