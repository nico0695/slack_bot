export const mockLogger = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
  fatal: jest.fn(),
  child: jest.fn().mockReturnThis(),
  trace: jest.fn(),
}

export const mockCreateModuleLogger = jest.fn().mockReturnValue(mockLogger)
