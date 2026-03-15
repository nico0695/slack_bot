import { Profiles } from '../shared/constants/auth.constants'
import { Entity, BaseEntity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm'

@Entity()
export class Users extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number

  @Column({ default: '' })
  username: string

  @Column()
  name: string

  @Column({ default: '' })
  lastName: string

  @Column()
  phone: string

  @Column({ nullable: true })
  email: string

  @CreateDateColumn()
  createdAt: Date

  @Column({ default: '' })
  slackTeamId: string

  @Column({ default: '' })
  slackId: string

  @Column({ default: '' })
  slackChannelId: string

  @Column({ default: null, nullable: true })
  supabaseId: string

  @Column({ default: Profiles.USER, nullable: true })
  profile: Profiles

  @Column({ default: null, nullable: true })
  image: string

  @Column({ default: false })
  enabled: boolean

  @Column({ default: null, nullable: true })
  atlassianEmail: string
}
