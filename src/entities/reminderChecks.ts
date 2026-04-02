import {
  Entity,
  BaseEntity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Index,
} from 'typeorm'

import { Reminders } from './reminders'

@Entity()
@Index(['reminder', 'occurrenceDate'], { unique: true })
export class ReminderChecks extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number

  @ManyToOne((type) => Reminders)
  @JoinColumn({ name: 'reminderId' })
  reminder: Reminders

  @Column()
  occurrenceDate: string

  @Column()
  checkedAt: Date

  @Column()
  checkedByUserId: number

  @CreateDateColumn()
  createdAt: Date
}
