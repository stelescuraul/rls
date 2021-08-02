import { Entity, PrimaryGeneratedColumn, Column, BaseEntity } from 'typeorm';

@Entity()
export class Category extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  tenantId: number;

  @Column()
  name: string;

  @Column({ type: 'boolean', nullable: true })
  numberValue: boolean;

  toJson() {
    return {
      id: this.id,
      tenantId: this.tenantId,
      name: this.name,
      numberValue: this.numberValue,
    };
  }
}
