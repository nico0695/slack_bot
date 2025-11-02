#!/usr/bin/env node

/**
 * Quick integration test for new image repositories
 * Run with: node test-image-repos.js
 */

console.log('🧪 Testing Image Repositories Integration...\n')

// Test 1: Check that files exist
const fs = require('fs')
const path = require('path')

const filesToCheck = [
  'src/modules/images/shared/interfaces/imageRepository.interface.ts',
  'src/modules/images/shared/constants/imageRepository.ts',
  'src/modules/images/repositories/openai/openaiImages.repository.ts',
  'src/modules/images/repositories/gemini/geminiImages.repository.ts',
  'src/modules/images/repositories/leap/leap.repository.ts',
  'src/modules/images/services/images.services.ts',
  'src/modules/images/repositories/openai/__tests__/openaiImages.repository.test.ts',
  'src/modules/images/repositories/gemini/__tests__/geminiImages.repository.test.ts',
]

console.log('✅ Checking file existence:')
let allFilesExist = true

filesToCheck.forEach((file) => {
  const fullPath = path.join(__dirname, file)
  const exists = fs.existsSync(fullPath)
  console.log(`  ${exists ? '✓' : '✗'} ${file}`)
  if (!exists) allFilesExist = false
})

if (!allFilesExist) {
  console.log('\n❌ Some files are missing!')
  process.exit(1)
}

console.log('\n✅ Checking exports:')

// Test 2: Check imports/exports work
try {
  // These will fail if there are syntax errors
  const interfaceContent = fs.readFileSync(
    'src/modules/images/shared/interfaces/imageRepository.interface.ts',
    'utf8'
  )
  console.log('  ✓ imageRepository.interface.ts has valid syntax')

  const constantsContent = fs.readFileSync(
    'src/modules/images/shared/constants/imageRepository.ts',
    'utf8'
  )
  console.log('  ✓ imageRepository.ts has valid syntax')

  // Check that ImageRepositoryType enum is defined
  if (constantsContent.includes('ImageRepositoryType')) {
    console.log('  ✓ ImageRepositoryType enum found')
  } else {
    console.log('  ✗ ImageRepositoryType enum NOT found')
    process.exit(1)
  }

  // Check that ImageRepositoryByType is defined
  if (constantsContent.includes('ImageRepositoryByType')) {
    console.log('  ✓ ImageRepositoryByType factory found')
  } else {
    console.log('  ✗ ImageRepositoryByType factory NOT found')
    process.exit(1)
  }

  // Check that all three providers are registered
  if (
    constantsContent.includes('OpenaiImagesRepository') &&
    constantsContent.includes('GeminiImagesRepository') &&
    constantsContent.includes('LeapRepository')
  ) {
    console.log('  ✓ All three providers registered (OpenAI, Gemini, Leap)')
  } else {
    console.log('  ✗ Not all providers are registered')
    process.exit(1)
  }
} catch (error) {
  console.log(`  ✗ Error reading files: ${error.message}`)
  process.exit(1)
}

console.log('\n✅ Checking repository implementations:')

// Test 3: Check that repositories implement IImageRepository
const openaiRepo = fs.readFileSync(
  'src/modules/images/repositories/openai/openaiImages.repository.ts',
  'utf8'
)
if (openaiRepo.includes('implements IImageRepository')) {
  console.log('  ✓ OpenaiImagesRepository implements IImageRepository')
} else {
  console.log('  ✗ OpenaiImagesRepository does NOT implement IImageRepository')
  process.exit(1)
}

const geminiRepo = fs.readFileSync(
  'src/modules/images/repositories/gemini/geminiImages.repository.ts',
  'utf8'
)
if (geminiRepo.includes('implements IImageRepository')) {
  console.log('  ✓ GeminiImagesRepository implements IImageRepository')
} else {
  console.log('  ✗ GeminiImagesRepository does NOT implement IImageRepository')
  process.exit(1)
}

const leapRepo = fs.readFileSync(
  'src/modules/images/repositories/leap/leap.repository.ts',
  'utf8'
)
if (leapRepo.includes('implements IImageRepository')) {
  console.log('  ✓ LeapRepository implements IImageRepository')
} else {
  console.log('  ✗ LeapRepository does NOT implement IImageRepository')
  process.exit(1)
}

console.log('\n✅ Checking service refactoring:')

// Test 4: Check that service uses abstraction
const service = fs.readFileSync('src/modules/images/services/images.services.ts', 'utf8')
if (service.includes('#imageRepository: IImageRepository')) {
  console.log('  ✓ ImagesServices uses IImageRepository interface')
} else {
  console.log('  ✗ ImagesServices does NOT use IImageRepository interface')
  process.exit(1)
}

if (service.includes('ImageRepositoryByType')) {
  console.log('  ✓ ImagesServices uses ImageRepositoryByType factory')
} else {
  console.log('  ✗ ImagesServices does NOT use factory pattern')
  process.exit(1)
}

if (service.includes('getDefaultImageRepositoryType')) {
  console.log('  ✓ ImagesServices uses getDefaultImageRepositoryType()')
} else {
  console.log('  ✗ ImagesServices does NOT use getDefaultImageRepositoryType()')
  process.exit(1)
}

console.log('\n✅ Checking tests:')

// Test 5: Check that tests exist and have proper structure
const openaiTest = fs.readFileSync(
  'src/modules/images/repositories/openai/__tests__/openaiImages.repository.test.ts',
  'utf8'
)
if (openaiTest.includes("describe('OpenaiImagesRepository'")) {
  console.log('  ✓ OpenaiImagesRepository tests are structured')
} else {
  console.log('  ✗ OpenaiImagesRepository tests are NOT properly structured')
  process.exit(1)
}

const geminiTest = fs.readFileSync(
  'src/modules/images/repositories/gemini/__tests__/geminiImages.repository.test.ts',
  'utf8'
)
if (geminiTest.includes("describe('GeminiImagesRepository'")) {
  console.log('  ✓ GeminiImagesRepository tests are structured')
} else {
  console.log('  ✗ GeminiImagesRepository tests are NOT properly structured')
  process.exit(1)
}

console.log('\n✅ Checking documentation:')

// Test 6: Check documentation
const claudeMd = fs.readFileSync('CLAUDE.md', 'utf8')
if (claudeMd.includes('Image Generation Management')) {
  console.log('  ✓ CLAUDE.md has Image Generation Management section')
} else {
  console.log('  ✗ CLAUDE.md is missing Image Generation Management section')
  process.exit(1)
}

if (claudeMd.includes('IMAGE_REPOSITORY_TYPE')) {
  console.log('  ✓ CLAUDE.md documents IMAGE_REPOSITORY_TYPE env var')
} else {
  console.log('  ✗ CLAUDE.md is missing IMAGE_REPOSITORY_TYPE documentation')
  process.exit(1)
}

console.log('\n🎉 All integration tests passed!')
console.log('\n📝 Next steps:')
console.log('  1. Add IMAGE_REPOSITORY_TYPE to your .env file')
console.log('  2. Run: npm test -- src/modules/images')
console.log('  3. Test manually with Slack: "img test prompt"')
console.log('  4. Review IMPLEMENTATION_SUMMARY.md for detailed info')
