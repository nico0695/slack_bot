export interface ILink {
  id?: number
  url: string
  title?: string
  description?: string
  tag?: string
  status?: string

  userId: number
  channelId?: string | null
}

export interface ILinkMetadata {
  title?: string
  description?: string
}
