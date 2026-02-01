import express from 'express'
import cors from 'cors'
import morgan from 'morgan'

import dotenv from 'dotenv'

import http from 'http'
import cron from 'node-cron'
import webpush from 'web-push'

import 'express-async-errors'
import { errorHandler } from './shared/middleware/errors'

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
import { alertCronJob } from './modules/alerts/utils/cronJob'
import AlertsWebController from './modules/alerts/controller/alersWeb.controller'
import TasksWebController from './modules/tasks/controller/tasksWeb.controller'
import NotesWebController from './modules/notes/controller/notesWeb.controller'
import { slackHelperMessage } from './shared/constants/slack.constants'

dotenv.config()

const slackPort = 3001

export default class App {
  #app: express.Application
  #slackApp: SlackApp

  #usersController: UsersController

  #conversationController: ConversationController
  #conversationWebController: ConversationsWebController

  #alertsWebController: AlertsWebController
  #tasksWebController: TasksWebController
  #notesWebController: NotesWebController

  #imagesController: ImagesController
  #imagesWebController: ImagesWebController

  #textToSpeechWebController: TextToSpeechWebController
  #summaryWebController: SummaryWebController

  constructor() {
    // Controllers Instances
    this.#usersController = UsersController.getInstance()

    this.#conversationController = ConversationController.getInstance()
    this.#conversationWebController = ConversationsWebController.getInstance()

    this.#alertsWebController = AlertsWebController.getInstance()
    this.#tasksWebController = TasksWebController.getInstance()
    this.#notesWebController = NotesWebController.getInstance()

    this.#imagesController = ImagesController.getInstance()
    this.#imagesWebController = ImagesWebController.getInstance()

    this.#textToSpeechWebController = TextToSpeechWebController.getInstance()
    this.#summaryWebController = SummaryWebController.getInstance()

    // Express
    this.#app = express()
    this.#config()

    // Slack
    this.#slackApp = connectionSlackApp

    this.#router()

    // Error handling
    this.#app.use(errorHandler)
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
    this.#app.use('/alerts', [this.#alertsWebController.router])
    this.#app.use('/tasks', [this.#tasksWebController.router])
    this.#app.use('/notes', [this.#notesWebController.router])
    this.#app.use('/images', [this.#imagesWebController.router])
    this.#app.use('/text-to-speech', [this.#textToSpeechWebController.router])
    this.#app.use('/summary', [this.#summaryWebController.router])
  }

  #slackListeners(): void {
    // Helper to wrap handlers with defensive checks and restart on undefined event
    const safeHandler = (handler: any) => {
      return async (args: any) => {
        return handler(args)
      }
    }

    // Start slack bot
    void this.#slackApp.start(process.env.PORT ?? slackPort).then(() => {
      console.log(`~ Slack Bot is running on port ${slackPort}!`)
    })

    // Actions slack bot
    this.#slackApp.action(
      /^(?:alert|note|task)_actions.*$|^(?:delete|view)_(?:alert|note|task)(?:_details)?$/,
      safeHandler(this.#conversationController.handleActions)
    )

    // Listener slack bot
    this.#slackApp.message(
      slackListenersKey.generateConversation,
      safeHandler(this.#conversationController.generateConversation)
    )
    this.#slackApp.message(
      slackListenersKey.cleanConversation,
      safeHandler(this.#conversationController.cleanConversation)
    )
    this.#slackApp.message(
      slackListenersKey.showConversation,
      safeHandler(this.#conversationController.showConversation)
    )

    this.#slackApp.message(
      slackListenersKey.generateImages,
      safeHandler(this.#imagesController.generateImages)
    )

    this.#slackApp.message(
      slackListenersKey.conversationFlow,
      safeHandler(this.#conversationController.conversationFlow)
    )

    this.#slackApp.command('/help', async ({ ack, body, client }: any): Promise<void> => {
      ack(slackHelperMessage)
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

        if (!channelId) {
          console.log('join_assistant_room: No channelId provided')
          return
        }

        const channel = channelId.toString().padStart(8, '9')

        void socket.join(channel) // Join the user to a socket room

        const joinResponse = await this.#conversationWebController.joinAssistantChannel({
          username,
          channel,
        })

        socket.emit('join_assistant_response', joinResponse) // Send message to user that joined
      })

      socket.on('send_assistant_message', async (data) => {
        const { message, userId } = data

        const channel = userId?.toString().padStart(8, '9')

        const conversationResponse =
          await this.#conversationWebController.conversationAssistantFlow(userId, message)

        if (conversationResponse) {
          io.in(channel).emit('receive_assistant_message', conversationResponse) // Send message to all users in channel, including sender
        }
      })

      socket.on('leave_assistant_room', async (data) => {
        const { channel: channelId }: IJoinRoomData = data

        if (!channelId) {
          console.log('leave_assistant_room: No channelId provided')
          return
        }

        const channel = channelId.toString().padStart(8, '9')

        void socket.leave(channel)
      })
    })
  }

  #cronJobs(): void {
    try {
      const cronJob = cron.schedule('* * * * *', alertCronJob)

      console.log('~ Cron Job is running')

      // Iniciar el cron
      cronJob.start()
    } catch (error) {
      console.log('Error cron job init', error)
    }
  }

  #webPushConfig(): void {
    const vapidKeys = {
      publicKey: process.env.VAPID_PUBLIC_KEY,
      privateKey: process.env.VAPID_PRIVATE_KEY,
    }
    console.log('~ Web Push Configured!')
    webpush.setVapidDetails('mailto: test@gmail.com', vapidKeys.publicKey, vapidKeys.privateKey)
  }

  // Start server
  public async start(): Promise<void> {
    process.on('uncaughtException', (err) => {
      console.error(`[${new Date().toISOString()}] Uncaught Exception:`, err.stack || err)
    })

    process.on('unhandledRejection', (reason, promise) => {
      console.error(
        `[${new Date().toISOString()}] Unhandled Rejection at:`,
        promise,
        'reason:',
        reason
      )
    })

    const server = http.createServer(this.#app)

    // Socket io
    this.#socketListeners(server)

    // Start express
    server.listen(this.#app.get('port'), () => {
      console.log('~ Socket Server listening in port 4000!')
    })

    // Slack
    this.#slackListeners()

    // Notifications
    this.#cronJobs()
    this.#webPushConfig()
  }
}
