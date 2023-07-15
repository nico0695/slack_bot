import { Entity, BaseEntity, PrimaryGeneratedColumn, Column } from 'typeorm'

@Entity()
export class Constants extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number

  @Column()
  key: string

  @Column()
  value: string
}
