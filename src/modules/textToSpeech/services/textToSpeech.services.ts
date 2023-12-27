import TransformersRepository from '../repositories/transformers/transformers.repository'

import { GenericResponse } from '../../../../src/shared/interfaces/services'
import TextToSpeechDataSources from '../repositories/database/textToSpeech.dataSource'
import { IPaginationOptions, IPaginationResponse } from '../../../shared/interfaces/pagination'
import { TextToSpeech } from '../../../entities/textToSpeech'

export default class TextToSpeechServices {
  #transformersRepository: TransformersRepository
  #textToSpeechDataSources: TextToSpeechDataSources

  constructor() {
    this.#transformersRepository = new TransformersRepository()
    this.#textToSpeechDataSources = new TextToSpeechDataSources()

    this.generateSpeech = this.generateSpeech.bind(this)
  }

  generateSpeech = async (phrase: string): Promise<GenericResponse<string>> => {
    const res = new GenericResponse<string>()
    try {
      const speechGenerated = await this.#transformersRepository.generateSpeech(phrase)

      const dataToSave = {
        path: speechGenerated.path,
        phrase,
        username: 'xenova',
      }

      await this.#textToSpeechDataSources.saveTextToSpeech(dataToSave)

      res.data = speechGenerated.fileName
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
