/**
 * Accepted image generation option values, shared by input validation
 * (messageProcessor routes) and the repositories.
 *
 * Native gpt-image-1 values plus legacy DALL-E 3 / Leap values; the legacy
 * ones are mapped to their closest native equivalent by each repository.
 */

export const VALID_IMAGE_SIZES = [
  '1024x1024',
  '1536x1024',
  '1024x1536',
  // Legacy sizes, mapped by the repository
  '1024x1792',
  '1792x1024',
  '512x512',
]

export const VALID_IMAGE_QUALITIES = ['low', 'medium', 'high', 'auto', 'standard', 'hd']
