import axios from 'axios'
import {
  IGenerateImageResponse,
  IInferaceJobResponse,
} from '../../shared/interfaces/images.interfaces'

export default class LeapRepository {
  #header

  #modelId = 'eab32df0-de26-4b83-a908-a83f3015e971'

  constructor() {
    this.generateImage = this.generateImage.bind(this)

    this.#header = {
      accept: 'application/json',
      'Content-Type': 'application/json',
      authorization: `Bearer ${process.env.LEAP_API_KEY}`,
    }
  }

  // generate image and get inference id
  generateImage = async (prompt: string): Promise<IGenerateImageResponse | null> => {
    try {
      const payload = {
        prompt,
        steps: 50,
        width: 512,
        height: 512,
        numberOfImages: 2,
        promptStrength: 7,
        enhancePrompt: false,
        restoreFaces: true,
        upscaleBy: 'x1',
      }

      const response = await axios.post(
        `https://api.tryleap.ai/api/v1/images/models/${this.#modelId}/inferences`,
        payload,
        {
          headers: this.#header,
        }
      )

      return {
        inferenceId: response.data.id,
        status: response.data.status,
      }
    } catch (error) {
      console.log('error= ', error.message)
      return null
    }
  }

  // ask for inference status and image by inference id
  getInterfaceJob = async (inferenceId: string): Promise<IInferaceJobResponse> => {
    try {
      const url = `https://api.tryleap.ai/api/v1/images/models/${
        this.#modelId
      }/inferences/${inferenceId}`

      const response = await axios.get(url, {
        headers: this.#header,
      })

      return {
        state: response.data.state,
        images: response.data.images ?? undefined,
      }
    } catch (error) {
      console.log('error getInterfaceJob= ', error.message)
    }
  }
}
