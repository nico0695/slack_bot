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
