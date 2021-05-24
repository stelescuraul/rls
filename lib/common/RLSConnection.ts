import { RLSPostgresDriver } from '../common/RLSPostgresDriver';
import {
  ActorId,
  TenancyModelOptions,
  TenantId,
} from '../interfaces/tenant-options.interface';
import { Connection, EntityMetadata } from 'typeorm';
import { RLSPostgresQueryRunner } from './RLSPostgresQueryRunner';

export class RLSConnection extends Connection {
  readonly driver: RLSPostgresDriver;

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

    const metadatas = [];

    this.entityMetadatas.forEach(em => {
      const wrappedMetadata = Object.assign({}, EntityMetadata.prototype, em, {
        connection: this,
      });
      metadatas.push(wrappedMetadata);
    });

    Object.assign(this, { entityMetadatas: metadatas });

    const driver = new RLSPostgresDriver(this, tenancyModelOptions);

    Object.assign(driver, { connection: this });
    Object.assign(this, { driver });

    const manager = this.createEntityManager();
    Object.assign(this, { manager });
  }

  createQueryRunner(): RLSPostgresQueryRunner {
    return super.createQueryRunner() as RLSPostgresQueryRunner;
  }

  close(): Promise<void> {
    throw new Error(
      'Cannot close connection on a virtual connection. Use the original connection object to close the connection',
    );
  }
}
