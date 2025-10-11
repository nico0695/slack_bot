import type { Config } from 'jest'

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['<rootDir>/src/**/*.test.ts'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'json'],
  clearMocks: true,
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/index.ts',
    '!src/**/__tests__/**',
  ],
  coverageDirectory: '<rootDir>/coverage',
  moduleNameMapper: {
    '^(\\.+/.*)\\.js$': '$1',
  },
  setupFilesAfterEnv: ['<rootDir>/src/tests/setup.ts'],
}

export default config
