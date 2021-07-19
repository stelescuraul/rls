import { Connection, EntityMetadata } from 'typeorm';
import { RelationMetadata } from 'typeorm/metadata/RelationMetadata';
import { RLSPostgresDriver } from '../common/RLSPostgresDriver';
import {
  ActorId,
  TenancyModelOptions,
  TenantId,
} from '../interfaces/tenant-options.interface';
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
    Object.assign(this.relationLoader, { connection: this });
    Object.assign(this.relationIdLoader, { connection: this });

    this.tenantId = tenancyModelOptions.tenantId;
    this.actorId = tenancyModelOptions.actorId;

    const metadatas = [];

    this.entityMetadatas.forEach(em => {
      const wrappedMetadata = Object.assign({}, EntityMetadata.prototype, em, {
        connection: this,
      });

      const metadataRelations = [];
      wrappedMetadata.relations.forEach(relation => {
        const wrappedRelation = Object.assign(
          {},
          RelationMetadata.prototype,
          relation,
        );

        Object.assign(wrappedRelation.entityMetadata, { connection: this });
        metadataRelations.push(wrappedRelation);
      });

      Object.assign(wrappedMetadata, { relations: metadataRelations });
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
