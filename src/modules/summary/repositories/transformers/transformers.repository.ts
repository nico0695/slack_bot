import { singleton } from 'tsyringe'

import { createModuleLogger } from '../../../../config/logger'
import { transformerApi } from '../../../../config/xenovaImport'

const log = createModuleLogger('summary.transformers')

@singleton()
export default class TransformersRepository {
  constructor() {}

  generateSummary = async (text: string): Promise<string | null> => {
    try {
      const { pipeline } = await transformerApi

      const generator = await pipeline('summarization', 'Xenova/distilbart-cnn-6-6')

      const output = await generator(text, {
        max_new_tokens: 100,
      })

      return output
    } catch (error) {
      log.error({ err: error }, 'generateSummary failed')
      return null
    }
  }
}
