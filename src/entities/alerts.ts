import {
  Entity,
  BaseEntity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  DeleteDateColumn,
} from 'typeorm'
import { Users } from './users'

@Entity()
export class Alerts extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number

  @Column()
  message: string

  @Column()
  date: Date

  @Column({ default: false })
  sent: boolean

  @Column({ nullable: true })
  channelId: string

  @ManyToOne((type) => Users)
  @JoinColumn({ name: 'userId' })
  user: Users

  @CreateDateColumn()
  createdAt: Date

  @DeleteDateColumn()
  deletedAt: Date
}
