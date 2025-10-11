export interface INote {
  id?: number
  title: string
  description: string
  tag?: string

  userId: number
  channelId?: string | null
}
