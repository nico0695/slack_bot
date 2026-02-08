import { Router } from 'express'
import { z } from 'zod'

import fs from 'fs'
import path from 'path'

import BadRequestError from '../../../shared/utils/errors/BadRequestError'
import { validateBody, validateQuery, validateParams, paginationSchema, idParamSchema } from '../../../shared/utils/validation'

import TextToSpeechServices from '../services/textToSpeech.services'
import { HttpAuth, Permission } from '../../../shared/middleware/auth'
import { Profiles } from '../../../shared/constants/auth.constants'

const generateSpeechSchema = z.object({
  phrase: z.string().min(1),
})

export default class TextToSpeechWebController {
  private static instance: TextToSpeechWebController

  public router: Router

  private textToSpeechServices: TextToSpeechServices

  private constructor() {
    this.generateTextoToSpeech = this.generateTextoToSpeech.bind(this)
    this.getTextToSpeechList = this.getTextToSpeechList.bind(this)
    this.getAudio = this.getAudio.bind(this)

    this.textToSpeechServices = TextToSpeechServices.getInstance()

    this.router = Router()
    this.registerRoutes()
  }

  static getInstance(): TextToSpeechWebController {
    if (this.instance) {
      return this.instance
    }

    this.instance = new TextToSpeechWebController()
    return this.instance
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
    const { phrase } = validateBody(generateSpeechSchema, req.body)

    const response = await this.textToSpeechServices.generateSpeech(phrase)

    if (response.error) {
      throw new BadRequestError({ message: response.error })
    }

    res.status(200).send(response.data)
  }

  @HttpAuth
  @Permission()
  public async getTextToSpeechList(req: any, res: any): Promise<void> {
    const { page, pageSize } = validateQuery(paginationSchema, req.query)

    const response = await this.textToSpeechServices.getTextToSpeechList(page, pageSize)

    if (response.error) {
      throw new BadRequestError({ message: response.error })
    }

    res.status(200).send(response.data)
  }

  @HttpAuth
  @Permission()
  public async getAudio(req: any, res: any): Promise<void> {
    const { id } = validateParams(idParamSchema, req.params)

    const response = await this.textToSpeechServices.getAudio(id)

    if (response.error) return res.status(500).send(response)

    if (response?.data && response?.data.length > 0) {
      const filePath = path.join(process.cwd(), response?.data)

      fs.readFile(filePath, (err, data) => {
        if (err) {
          throw new BadRequestError({ message: err.message })
        } else {
          res.setHeader('Content-Type', 'audio/mpeg')
          res.send(data)
        }
      })
    }
  }
}
