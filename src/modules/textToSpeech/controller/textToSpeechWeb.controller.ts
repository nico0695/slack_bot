import { Router } from 'express'

import fs from 'fs'
import path from 'path'

import TextToSpeechServices from '../services/textToSpeech.services'

export default class TextToSpeechWebController {
  public router: Router

  #textToSpeechServices: TextToSpeechServices

  constructor() {
    this.#textToSpeechServices = new TextToSpeechServices()

    this.router = Router()
    this.registerRoutes()
  }

  protected registerRoutes(): void {
    this.router.get('/', this.getTextToSpeechList)
    this.router.get('/:id/audio', this.getAudio)
    this.router.post('/generate', this.generateTextoToSpeech)
  }

  // ROUTES

  public generateTextoToSpeech = async (req: any, res: any): Promise<void> => {
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
      console.log('error= ', error.message)
      res.status(500).send({ error: error.message })
    }
  }

  public getTextToSpeechList = async (req: any, res: any): Promise<void> => {
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

  getAudio = async (req: any, res: any): Promise<void> => {
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
      console.log('error= ', error.message)
      res.status(500).send({ error: error.message })
    }
  }
}
