import TransformersRepository from '../repositories/transformers/transformers.repository'

import { GenericResponse } from '../../../shared/interfaces/services'
import TextToSpeechDataSources from '../repositories/database/textToSpeech.dataSource'
import { IPaginationOptions, IPaginationResponse } from '../../../shared/interfaces/pagination'
import { TextToSpeech } from '../../../entities/textToSpeech'

export default class TextToSpeechServices {
  static #instance: TextToSpeechServices

  #transformersRepository: TransformersRepository
  #textToSpeechDataSources: TextToSpeechDataSources

  private constructor() {
    this.#transformersRepository = TransformersRepository.getInstance()
    this.#textToSpeechDataSources = TextToSpeechDataSources.getInstance()

    this.generateSpeech = this.generateSpeech.bind(this)
  }

  static getInstance(): TextToSpeechServices {
    if (this.#instance) {
      return this.#instance
    }

    this.#instance = new TextToSpeechServices()
    return this.#instance
  }

  generateSpeech = async (phrase: string): Promise<GenericResponse<string>> => {
    const res = new GenericResponse<string>()
    try {
      const speechGenerated = await this.#transformersRepository.generateSpeech(phrase)

      if (!speechGenerated) {
        throw new Error('Error generating speech')
      }

      const dataToSave = {
        path: speechGenerated.path,
        phrase,
        username: 'xenova',
      }

      await this.#textToSpeechDataSources.saveTextToSpeech(dataToSave)

      res.data = speechGenerated?.fileName
      return res
    } catch (error) {
      res.error = 'Error generating speech'
      return res
    }
  }

  getTextToSpeechList = async (
    page: number,
    pageSize: number
  ): Promise<GenericResponse<IPaginationResponse<TextToSpeech>>> => {
    try {
      const options: IPaginationOptions = {
        page,
        pageSize,
      }

      const data = await this.#textToSpeechDataSources.getAllTextToSpeech(options)

      return { data }
    } catch (error) {
      return { error: 'Error al obtener las imagenes' }
    }
  }

  getAudio = async (id: number): Promise<GenericResponse<string>> => {
    const res = new GenericResponse<string>()
    try {
      const data = await this.#textToSpeechDataSources.getTextToSpeechById(id)

      if (data) {
        res.data = data.path
      }

      return res
    } catch (error) {
      res.error = 'Error generating speech'
      return res
    }
  }
}
