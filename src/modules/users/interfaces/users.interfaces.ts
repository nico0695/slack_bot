import { Profiles } from '../../../shared/constants/auth.constants'

export interface IUsers {
  id?: number
  username: string
  name: string
  lastName: string
  phone: string
  email: string
  createdAt?: Date

  slackId?: string
  slackTeamId?: string
  slackChannelId?: string

  supabaseId?: string

  profile?: Profiles

  image?: string
  enabled: boolean

  atlassianEmail?: string
}
