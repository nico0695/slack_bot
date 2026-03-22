import { injectable } from 'tsyringe'

import TransformersRepository from '../repositories/transformers/transformers.repository'

import { GenericResponse } from '../../../shared/interfaces/services'
import TextToSpeechDataSources from '../repositories/database/textToSpeech.dataSource'
import { IPaginationOptions, IPaginationResponse } from '../../../shared/interfaces/pagination'
import { TextToSpeech } from '../../../entities/textToSpeech'
import { createModuleLogger } from '../../../config/logger'

const log = createModuleLogger('textToSpeech.service')

@injectable()
export default class TextToSpeechServices {
  constructor(
    private transformersRepository: TransformersRepository,
    private textToSpeechDataSources: TextToSpeechDataSources
  ) {
    this.generateSpeech = this.generateSpeech.bind(this)
  }

  generateSpeech = async (phrase: string): Promise<GenericResponse<string>> => {
    const res = new GenericResponse<string>()
    try {
      const speechGenerated = await this.transformersRepository.generateSpeech(phrase)

      if (!speechGenerated) {
        throw new Error('Error generating speech')
      }

      const dataToSave = {
        path: speechGenerated.path,
        phrase,
        username: 'xenova',
      }

      await this.textToSpeechDataSources.saveTextToSpeech(dataToSave)

      res.data = speechGenerated?.fileName
      return res
    } catch (error) {
      log.error({ err: error }, 'generateSpeech failed')
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

      const data = await this.textToSpeechDataSources.getAllTextToSpeech(options)

      return { data }
    } catch (error) {
      log.error({ err: error }, 'getTextToSpeechList failed')
      return { error: 'Error al obtener las imagenes' }
    }
  }

  getAudio = async (id: number): Promise<GenericResponse<string>> => {
    const res = new GenericResponse<string>()
    try {
      const data = await this.textToSpeechDataSources.getTextToSpeechById(id)

      if (data) {
        res.data = data.path
      }

      return res
    } catch (error) {
      log.error({ err: error, id }, 'getAudio failed')
      res.error = 'Error generating speech'
      return res
    }
  }
}
