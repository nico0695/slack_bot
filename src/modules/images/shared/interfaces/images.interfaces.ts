import { LeapStatus } from '../constants/leap'

// Re-export common repository interfaces
export * from './imageRepository.interface'

// Leap-specific interfaces (legacy)
export interface IGenerateImageResponse {
  status: LeapStatus
  inferenceId: string
}

export interface ILeapImages {
  id: string
  uri: string
  createdAt: string
}

export interface IInferaceJobResponse {
  state: LeapStatus
  images?: ILeapImages[]
}

// Database and user interfaces (shared across all providers)
export interface IImage {
  imageUrl: string
  inferenceId: string
  username?: string
  slackTeamId?: string
  slackId: string
  prompt?: string
}

export interface IUserData {
  slackId: string
  slackTeamId: string
  username: string
}
