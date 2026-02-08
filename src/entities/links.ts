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
import { LinkStatus } from '../modules/links/shared/constants/links.constants'

@Entity()
export class Links extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number

  @Column()
  url: string

  @Column({ default: '' })
  title: string

  @Column({ default: '' })
  description: string

  @Column({ default: '' })
  tag: string

  @Column({ default: LinkStatus.UNREAD })
  status: string

  @Column({ nullable: true })
  channelId: string

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
