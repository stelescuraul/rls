import { RLSPostgresQueryRunner } from 'lib/common/RLSPostgresQueryRunner';
import {
  ActorId,
  TenancyModelOptions,
  TenantId,
} from 'lib/interfaces/tenant-options.interface';
import { Connection, QueryRunner, ReplicationMode } from 'typeorm';
import { PostgresDriver } from 'typeorm/driver/postgres/PostgresDriver';

export class RLSPostgresDriver extends PostgresDriver {
  tenantId: TenantId = null;
  actorId: ActorId = null;

  constructor(
    connection: Connection,
    tenancyModelOptions: TenancyModelOptions,
  ) {
    super(connection);
    Object.assign(this, connection.driver);

    this.tenantId = tenancyModelOptions.tenantId;
    this.actorId = tenancyModelOptions.actorId;
  }

  createQueryRunner(mode: ReplicationMode): QueryRunner {
    return new RLSPostgresQueryRunner(this, mode, {
      tenantId: this.tenantId,
      actorId: this.actorId,
    });
  }
}
