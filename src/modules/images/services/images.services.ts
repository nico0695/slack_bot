import LeapRepository from '../repositories/leap/leap.repository'
import { LeapStatus } from '../shared/constants/leap'

export default class ImagessServices {
  #leapRepository: LeapRepository

  constructor() {
    this.#leapRepository = new LeapRepository()

    this.generateImages = this.generateImages.bind(this)
  }

  generateImages = async (prompt: string, say: (message: string) => void): Promise<string> => {
    try {
      // Generate image and get inference id
      const inference = await this.#leapRepository.generateImage(prompt)

      say('Generando imagen...')

      let status = inference?.status

      let returnValue = null

      // Wait until inference is finished
      while (status !== LeapStatus.finished) {
        // ask for inference status and image generated
        const inferaceJob = await this.#leapRepository.getInterfaceJob(inference?.inferenceId)

        status = inferaceJob.state

        if (status === LeapStatus.finished) {
          returnValue = inferaceJob
        }
      }

      if (returnValue !== null && returnValue.images.length > 0) {
        return returnValue.images
          .map((image, index) => `Imagen #${index + 1}: ${image.uri}`)
          .join('\n')
      }

      return 'No se pudo generar la imagen'
    } catch (error) {
      console.log('error= ', error.message)
      return 'No se pudo generar la imagen'
    }
  }
}
