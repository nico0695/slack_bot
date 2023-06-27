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
}
