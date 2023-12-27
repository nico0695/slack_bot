import fs from 'fs'
import { transformerApi } from '../../../../config/xenovaImport'
import { generateRandomFileName } from '../../../../shared/utils/generators'

const EMBED =
  'https://huggingface.co/datasets/Xenova/transformers.js-docs/resolve/main/speaker_embeddings.bin'

export default class TransformersRepository {
  generateSpeech = async (
    phrase: string
  ): Promise<{
    fileName: string
    path: string
  } | null> => {
    try {
      const { pipeline } = await transformerApi

      const fileName = `${generateRandomFileName()}.wav`

      const synthesizer = await pipeline('text-to-speech', 'Xenova/speecht5_tts', {
        quantized: false,
      })

      const output = await synthesizer(phrase, {
        speaker_embeddings: EMBED,
      })

      const wavefile = await import('wavefile')
      const wav = new wavefile.WaveFile()
      wav.fromScratch(1, output.sampling_rate, '32f', output.audio)

      const path = `./src/assets/audio/${fileName}`
      fs.writeFileSync(path, wav.toBuffer())

      return {
        fileName,
        path,
      }
    } catch (error) {
      console.log('repository error= ', error)
      return null
    }
  }
}
