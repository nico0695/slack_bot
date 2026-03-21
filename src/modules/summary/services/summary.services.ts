import { injectable } from 'tsyringe'

import TransformersRepository from '../repositories/transformers/transformers.repository'

import { GenericResponse } from '../../../shared/interfaces/services'
import { createModuleLogger } from '../../../config/logger'

const log = createModuleLogger('summary.service')

@injectable()
export default class SummaryServices {
  constructor(private transformersRepository: TransformersRepository) {}

  generateSumary = async (text: string): Promise<GenericResponse<string>> => {
    const res = new GenericResponse<string>()
    try {
      const summarization = await this.transformersRepository.generateSummary(text)

      res.data = summarization
      return res
    } catch (error) {
      log.error({ err: error }, 'generateSummary failed')
      res.error = 'Error generating summary'
      return res
    }
  }
}
