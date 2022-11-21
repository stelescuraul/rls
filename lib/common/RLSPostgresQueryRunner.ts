import { ReplicationMode } from 'typeorm';
import { PostgresDriver } from 'typeorm/driver/postgres/PostgresDriver';
import { PostgresQueryRunner } from 'typeorm/driver/postgres/PostgresQueryRunner';
import { IsolationLevel } from 'typeorm/driver/types/IsolationLevel';
import {
  ActorId,
  TenancyModelOptions,
  TenantId,
} from '../interfaces/tenant-options.interface';

export class RLSPostgresQueryRunner extends PostgresQueryRunner {
  tenantId: TenantId = null;
  actorId: ActorId = null;
  isTransactionCommand = false;

  constructor(
    driver: PostgresDriver,
    mode: ReplicationMode,
    tenancyModelOptions: TenancyModelOptions,
  ) {
    super(driver, mode);
    this.setOptions(tenancyModelOptions);
  }

  private setOptions(tenancyModelOptions: TenancyModelOptions) {
    this.tenantId = tenancyModelOptions.tenantId;
    this.actorId = tenancyModelOptions.actorId;
  }

  async query(
    queryString: string,
    params?: any[],
    useStructuredResult?: boolean,
  ): Promise<any> {
    if (!this.isTransactionCommand) {
      await super.query(
        `set "rls.tenant_id" = '${this.tenantId}'; set "rls.actor_id" = '${this.actorId}';`,
      );
    }

    let result: Promise<any>;
    let error: Error;
    try {
      result = await super.query(queryString, params, useStructuredResult);
    } catch (err) {
      error = err;
    }

    if (!this.isTransactionCommand) {
      await super.query(`reset rls.actor_id; reset rls.tenant_id;`);
    }

    if (error) throw error;
    else return result;
  }

  async startTransaction(isolationLevel?: IsolationLevel): Promise<void> {
    this.isTransactionCommand = true;
    await super.startTransaction(isolationLevel);
    this.isTransactionCommand = false;
  }

  async commitTransaction(): Promise<void> {
    this.isTransactionCommand = true;
    await super.commitTransaction();
    this.isTransactionCommand = false;
  }

  async rollbackTransaction(): Promise<void> {
    this.isTransactionCommand = true;
    await super.rollbackTransaction();
    this.isTransactionCommand = false;
  }
}
