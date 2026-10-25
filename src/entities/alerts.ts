import {
  Entity,
  BaseEntity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  DeleteDateColumn,
  Index,
} from 'typeorm'
import { Users } from './users'

@Entity()
// NULL requestIds are distinct in SQLite, so alerts without one are unaffected
@Index(['user', 'requestId'], { unique: true })
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

  // Client generated id used to make creation retries idempotent
  @Column({ nullable: true, default: null })
  requestId: string | null

  @Column({ nullable: true, default: null })
  source: string | null

  @Column({ nullable: true, default: null })
  deviceId: string | null

  @ManyToOne((type) => Users)
  @JoinColumn({ name: 'userId' })
  user: Users

  @CreateDateColumn()
  createdAt: Date

  @DeleteDateColumn()
  deletedAt: Date
}
