import {
  Entity,
  BaseEntity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  DeleteDateColumn,
  UpdateDateColumn,
} from 'typeorm'

import { Users } from './users'
import {
  ReminderRecurrenceType,
  ReminderStatus,
} from '../modules/reminders/shared/constants/reminders.constants'

@Entity()
export class Reminders extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number

  @Column()
  message: string

  @Column({ default: ReminderRecurrenceType.DAILY })
  recurrenceType: string

  @Column()
  timeOfDay: string

  @Column('simple-json', { nullable: true, default: null })
  weekDays: number[] | null

  @Column('simple-json', { nullable: true, default: null })
  monthDays: number[] | null

  @Column({ default: ReminderStatus.ACTIVE })
  status: string

  @Column()
  nextTriggerAt: Date

  @Column({ nullable: true, default: null })
  lastTriggeredAt: Date | null

  @Column({ nullable: true, default: null })
  channelId: string | null

  @ManyToOne((type) => Users)
  @JoinColumn({ name: 'userId' })
  user: Users

  @CreateDateColumn()
  createdAt: Date

  @UpdateDateColumn()
  updatedAt: Date

  @DeleteDateColumn()
  deletedAt: Date
}
