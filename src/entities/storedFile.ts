import {
  Entity,
  BaseEntity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm'

@Entity()
export class StoredFile extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number

  @Column()
  storageFileId: string

  @Column()
  fileName: string

  @Column()
  path: string

  @Column()
  fullPath: string

  @Column()
  mimeType: string

  @Column({ default: 0 })
  size: number

  @Column({ nullable: true })
  downloadUrl: string

  @Column({ type: 'simple-json', nullable: true })
  metadata: Record<string, string>

  @Column()
  sourceModule: string

  @CreateDateColumn()
  createdAt: Date

  @UpdateDateColumn()
  updatedAt: Date
}
