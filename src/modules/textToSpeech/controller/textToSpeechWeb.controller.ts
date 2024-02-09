import { Router } from 'express'

import fs from 'fs'
import path from 'path'

import TextToSpeechServices from '../services/textToSpeech.services'
import { HttpAuth, Permission } from '../../../shared/middleware/auth'
import { Profiles } from '../../../shared/constants/auth.constants'

export default class TextToSpeechWebController {
  static #instance: TextToSpeechWebController

  public router: Router

  #textToSpeechServices: TextToSpeechServices

  private constructor() {
    this.generateTextoToSpeech = this.generateTextoToSpeech.bind(this)
    this.getTextToSpeechList = this.getTextToSpeechList.bind(this)
    this.getAudio = this.getAudio.bind(this)

    this.#textToSpeechServices = TextToSpeechServices.getInstance()

    this.router = Router()
    this.registerRoutes()
  }

  static getInstance(): TextToSpeechWebController {
    if (this.#instance) {
      return this.#instance
    }

    this.#instance = new TextToSpeechWebController()
    return this.#instance
  }

  protected registerRoutes(): void {
    this.router.get('/', this.getTextToSpeechList)
    this.router.get('/:id/audio', this.getAudio)
    this.router.post('/generate', this.generateTextoToSpeech)
  }

  // ROUTES

  @HttpAuth
  @Permission([Profiles.ADMIN, Profiles.USER_PREMIUM])
  public async generateTextoToSpeech(req: any, res: any): Promise<void> {
    const { body } = req
    const { phrase } = body
    try {
      if (!phrase) {
        res.status(400).send({ error: 'Prompt is required' })
      }
      const response = await this.#textToSpeechServices.generateSpeech(phrase)

      if (response.error) res.status(500).send(response)

      res.status(200).send(response.data)
    } catch (error) {
      res.status(500).send({ error: error.message })
    }
  }

  @HttpAuth
  @Permission()
  public async getTextToSpeechList(req: any, res: any): Promise<void> {
    const {
      query: { page = 1, pageSize = 6 },
    } = req

    try {
      const pageInt = parseInt(page, 10)
      const sizeInt = parseInt(pageSize, 10)

      const response = await this.#textToSpeechServices.getTextToSpeechList(pageInt, sizeInt)

      if (response.error) res.status(500).send(response)

      res.status(200).send(response.data)
    } catch (error) {
      console.log('error= ', error.message)
      res.status(500).send({ error: error.message })
    }
  }

  @HttpAuth
  @Permission()
  public async getAudio(req: any, res: any): Promise<void> {
    const {
      params: { id },
    } = req

    try {
      const response = await this.#textToSpeechServices.getAudio(id)

      if (response.error) return res.status(500).send(response)

      if (response?.data && response?.data.length > 0) {
        const filePath = path.join(process.cwd(), response?.data)

        fs.readFile(filePath, (err, data) => {
          if (err) {
            res.status(500).send({ error: err.message })
          } else {
            res.setHeader('Content-Type', 'audio/mpeg')
            res.send(data)
          }
        })
      }
    } catch (error) {
      res.status(500).send({ error: error.message })
    }
  }
}
