import {
  Entity,
  BaseEntity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm'

import { BridgeDeliveryStatus } from '../modules/bridge/shared/constants/bridge.constants'
import { IBridgeAlertEventPayload } from '../modules/bridge/shared/interfaces/bridge.interfaces'

// Outbox of webhook events sent to the bridge, one row per alert occurrence
@Entity()
@Index(['alertId', 'occurrenceAt'], { unique: true })
@Index(['status', 'nextAttemptAt'])
export class BridgeDeliveries extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number

  @Column({ unique: true })
  eventId: string

  // No foreign keys: alerts are hard deleted and pending events are still delivered
  @Column()
  alertId: number

  @Column()
  userId: number

  // Alert date when it was triggered; a rescheduled alert is a new occurrence
  @Column()
  occurrenceAt: Date

  @Column('simple-json')
  payload: IBridgeAlertEventPayload

  @Column({ default: BridgeDeliveryStatus.PENDING })
  status: string

  @Column({ default: 0 })
  attempts: number

  @Column()
  nextAttemptAt: Date

  @Column({ nullable: true, default: null })
  lockedUntil: Date | null

  @Column({ nullable: true, default: null })
  lastStatusCode: number | null

  @Column({ nullable: true, default: null })
  lastError: string | null

  @Column({ nullable: true, default: null })
  deliveredAt: Date | null

  @CreateDateColumn()
  createdAt: Date

  @UpdateDateColumn()
  updatedAt: Date
}
