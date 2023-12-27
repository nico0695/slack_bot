import { IPaginationOptions, IPaginationResponse } from '../../../../shared/interfaces/pagination'
import { TextToSpeech } from '../../../../entities/textToSpeech'
import { ITextToSpeech } from '../../shared/interfaces/textToSpeech.interfaces'

export default class TextToSpeechDataSources {
  static #instance: TextToSpeechDataSources

  private constructor() {}

  static getInstance(): TextToSpeechDataSources {
    if (this.#instance) {
      return this.#instance
    }

    this.#instance = new TextToSpeechDataSources()
    return this.#instance
  }

  /**
   * Save user in database
   * @param data IImage - Data image
   * @returns
   */
  public async saveTextToSpeech(data: ITextToSpeech): Promise<TextToSpeech> {
    try {
      const textToSpeech = new TextToSpeech()

      textToSpeech.path = data.path
      textToSpeech.phrase = data.phrase
      textToSpeech.username = data.username
      textToSpeech.slackTeamId = data.slackTeamId ?? null
      textToSpeech.slackId = data.slackId ?? null

      await textToSpeech.save()

      return textToSpeech
    } catch (error) {
      return error
    }
  }

  /**
   * Get all speech with pagination
   * @param page number - Page
   * @param pageSize number - Limit
   * @returns TextToSpeech[]
   */
  public async getAllTextToSpeech(
    options: IPaginationOptions
  ): Promise<IPaginationResponse<TextToSpeech>> {
    const response = new IPaginationResponse<TextToSpeech>(options)

    const skip = (options.page - 1) * options.pageSize

    try {
      const textToSpeech = await TextToSpeech.findAndCount({
        skip: skip > 0 ? skip : 0,
        take: options.pageSize,
      })

      response.setData(textToSpeech[0], textToSpeech[1])

      return response
    } catch (error) {
      return error
    }
  }

  public async getTextToSpeechById(id: number): Promise<TextToSpeech> {
    const textToSpeech = await TextToSpeech.findOneBy({ id })

    return textToSpeech
  }
}
