// src/di-container.ts
import { container } from 'tsyringe'

import OpenaiRepository from './modules/conversations/repositories/openai/openai.repository'
import GeminiRepository from './modules/conversations/repositories/gemini/gemini.repository'
import OpenaiImagesRepository from './modules/images/repositories/openai/openaiImages.repository'
import GeminiImagesRepository from './modules/images/repositories/gemini/geminiImages.repository'
import LeapRepository from './modules/images/repositories/leap/leap.repository'
import OpenaiTranslateRepository from './modules/translate/repositories/openai/openaiTranslate.repository'
import GeminiTranslateRepository from './modules/translate/repositories/gemini/geminiTranslate.repository'

// AI repository para conversations (seleccionado por env var)
const aiType = process.env.AI_REPOSITORY_TYPE ?? 'OPENAI'
const aiRepoClass = (aiType === 'GEMINI' ? GeminiRepository : OpenaiRepository) as any
container.register('AIRepository', { useClass: aiRepoClass })

// Image repository para images (seleccionado por env var)
const imageType = process.env.IMAGE_REPOSITORY_TYPE ?? 'OPENAI'
const imageRepoMap: Record<string, any> = {
  OPENAI: OpenaiImagesRepository,
  GEMINI: GeminiImagesRepository,
  LEAP: LeapRepository,
}
container.register('ImageRepository', {
  useClass: imageRepoMap[imageType] ?? OpenaiImagesRepository,
})

// Translate repository (seleccionado por env var)
const translateType = process.env.TRANSLATE_REPOSITORY_TYPE ?? 'OPENAI'
const translateRepoClass = (
  translateType === 'GEMINI' ? GeminiTranslateRepository : OpenaiTranslateRepository
) as any
container.register('TranslateRepository', { useClass: translateRepoClass })
