export interface IUsers {
  id?: number;
  username: string;
  name: string;
  lastName: string;
  phone: string;
  email: string;
  createdAt?: Date;
  slackId?: string;
  slackTeamId?: string;
}
