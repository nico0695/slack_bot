/**
 * Image repository type enum and factory pattern
 * Follows the same pattern as AIRepositoryType in conversations module
 */

import LeapRepository from '../../repositories/leap/leap.repository'
import OpenaiImagesRepository from '../../repositories/openai/openaiImages.repository'
import GeminiImagesRepository from '../../repositories/gemini/geminiImages.repository'

/**
 * Enum for selecting which image generation provider to use
 */
export enum ImageRepositoryType {
  LEAP = 'LEAP',
  OPENAI = 'OPENAI',
  GEMINI = 'GEMINI',
}

/**
 * Factory pattern for image repositories
 * Maps repository types to their singleton classes
 *
 * Similar to AIRepositoryByType in conversations module:
 * const AIRepositoryByType = {
 *   [AIRepositoryType.OPENAI]: OpenaiRepository,
 *   [AIRepositoryType.GEMINI]: GeminiRepository,
 * }
 */
export const ImageRepositoryByType = {
  [ImageRepositoryType.LEAP]: LeapRepository,
  [ImageRepositoryType.OPENAI]: OpenaiImagesRepository,
  [ImageRepositoryType.GEMINI]: GeminiImagesRepository,
}

/**
 * Get default repository type from environment or fallback to OpenAI
 */
export const getDefaultImageRepositoryType = (): ImageRepositoryType => {
  const envType = process.env.IMAGE_REPOSITORY_TYPE as ImageRepositoryType
  return envType && ImageRepositoryType[envType] ? envType : ImageRepositoryType.OPENAI
}
