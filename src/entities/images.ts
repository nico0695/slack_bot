import { Entity, BaseEntity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm'

@Entity()
export class Images extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number

  @Column()
  imageUrl: string

  @Column()
  inferenceId: string

  @Column({ default: '' })
  username: string

  @Column({ default: null, nullable: true })
  slackTeamId: string

  @Column()
  slackId: string

  @Column({ default: '', nullable: false })
  prompt: string

  @CreateDateColumn()
  createdAt: Date
}
