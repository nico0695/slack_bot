export interface IAlerts {
  id?: number
  message: string
  date: Date
  userId: number
}

export interface IAlertToNotify extends IAlerts {
  user: {
    username: string
    email: string
    slackId: string
    slackChannelId: string
  }
}
