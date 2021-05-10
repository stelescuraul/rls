import { RLSPostgresQueryRunner } from './RLSPostgresQueryRunner';
import {
  ActorId,
  TenancyModelOptions,
  TenantId,
} from '../interfaces/tenant-options.interface';
import { ReplicationMode } from 'typeorm';
import { PostgresDriver } from 'typeorm/driver/postgres/PostgresDriver';
import { RLSConnection } from 'lib/common/RLSConnection';

export class RLSPostgresDriver extends PostgresDriver {
  tenantId: TenantId = null;
  actorId: ActorId = null;

  constructor(
    connection: RLSConnection,
    tenancyModelOptions: TenancyModelOptions,
  ) {
    super(connection);
    Object.assign(this, connection.driver);

    this.tenantId = tenancyModelOptions.tenantId;
    this.actorId = tenancyModelOptions.actorId;
  }

  createQueryRunner(mode: ReplicationMode): RLSPostgresQueryRunner {
    return new RLSPostgresQueryRunner(this, mode, {
      tenantId: this.tenantId,
      actorId: this.actorId,
    });
  }
}
