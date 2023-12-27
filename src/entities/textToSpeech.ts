import { Entity, BaseEntity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm'

@Entity()
export class TextToSpeech extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number

  @Column()
  path: string

  @Column()
  phrase: string

  @Column({ default: '' })
  username: string

  @Column({ default: null, nullable: true })
  slackTeamId: string

  @Column({ default: null, nullable: true })
  slackId: string

  @CreateDateColumn()
  createdAt: Date
}
