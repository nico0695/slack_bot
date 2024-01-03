import TransformersRepository from '../repositories/transformers/transformers.repository'

import { GenericResponse } from '../../../shared/interfaces/services'

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
      res.error = 'Error generating summary'
      return res
    }
  }
}
