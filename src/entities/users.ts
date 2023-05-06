import { Entity, BaseEntity, PrimaryGeneratedColumn, Column, CreateDateColumn } from "typeorm"

@Entity()
export class Users extends BaseEntity {
    @PrimaryGeneratedColumn()
    id: number

    @Column()
    name: string

    @Column()
    phone: string

    @Column()
    email: string

    @CreateDateColumn()
    createdAt: Date
}