import { LeapStatus } from '../constants/leap'

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
