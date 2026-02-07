import TransformersRepository from '../repositories/transformers/transformers.repository'

import { GenericResponse } from '../../../shared/interfaces/services'
import { createModuleLogger } from '../../../config/logger'

const log = createModuleLogger('summary.service')

export default class SummaryServices {
  static #instance: SummaryServices

  #transformersRepository: TransformersRepository

  private constructor() {
    this.#transformersRepository = TransformersRepository.getInstance()
  }

  static getInstance(): SummaryServices {
    if (this.#instance) {
      return this.#instance
    }

    this.#instance = new SummaryServices()
    return this.#instance
  }

  generateSumary = async (text: string): Promise<GenericResponse<string>> => {
    const res = new GenericResponse<string>()
    try {
      const summarization = await this.#transformersRepository.generateSummary(text)

      res.data = summarization
      return res
    } catch (error) {
      log.error({ err: error }, 'generateSummary failed')
      res.error = 'Error generating summary'
      return res
    }
  }
}
