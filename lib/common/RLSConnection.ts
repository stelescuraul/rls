import { RLSPostgresDriver } from '../common/RLSPostgresDriver';
import {
  ActorId,
  TenancyModelOptions,
  TenantId,
} from '../interfaces/tenant-options.interface';
import { Connection } from 'typeorm';

export class RLSConnection extends Connection {
  tenantId: TenantId = null;
  actorId: ActorId = null;

  constructor(
    connection: Connection,
    tenancyModelOptions: TenancyModelOptions,
  ) {
    super(connection.options);
    Object.assign(this, connection);

    this.tenantId = tenancyModelOptions.tenantId;
    this.actorId = tenancyModelOptions.actorId;

    const driver = new RLSPostgresDriver(this, tenancyModelOptions);

    Object.assign(driver, { connection: this });
    Object.assign(this, { driver });

    const manager = this.createEntityManager();
    Object.assign(this, { manager });
  }

  close(): Promise<void> {
    throw new Error(
      'Cannot close connection on a virtual connection. Use the original connection object to close the connection',
    );
  }
}
