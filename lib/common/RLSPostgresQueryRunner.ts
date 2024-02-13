import { ReplicationMode } from 'typeorm';
import { PostgresDriver } from 'typeorm/driver/postgres/PostgresDriver';
import { PostgresQueryRunner } from 'typeorm/driver/postgres/PostgresQueryRunner';
import { IsolationLevel } from 'typeorm/driver/types/IsolationLevel';
import {
  ActorId,
  TenancyModelOptions,
  TenantId,
} from '../interfaces/tenant-options.interface';
import { ReadStream } from 'typeorm/platform/PlatformTools';

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

  private async setOptionsInDB() {
    await super.query(
      `set "rls.tenant_id" = '${this.tenantId}'; set "rls.actor_id" = '${this.actorId}';`,
    );
  }

  private async resetOptionsInDB() {
    await super.query(`reset rls.actor_id; reset rls.tenant_id;`);
  }

  async query(
    queryString: string,
    params?: any[],
    useStructuredResult?: boolean,
  ): Promise<any> {
    if (!this.isTransactionCommand) {
      await this.setOptionsInDB();
    }

    let result: Promise<any>;
    let error: Error;
    try {
      result = await super.query(queryString, params, useStructuredResult);
    } catch (err) {
      error = err;
    }

    if (!this.isTransactionCommand && !(this.isTransactionActive && error)) {
      await this.resetOptionsInDB();
    }

    if (error) throw error;
    else return result;
  }

  async stream(
    queryString: string,
    params?: any[],
    onEnd?: () => void,
    onError?: (err: Error) => void,
  ): Promise<ReadStream> {
    await this.setOptionsInDB();
    try {
      return await super.stream(
        queryString,
        params,
        async () => {
          await this.resetOptionsInDB();

          if (onEnd) {
            onEnd();
          }
        },
        async (err: Error) => {
          if (!this.isTransactionActive) {
            await this.resetOptionsInDB();
          }

          if (onError) {
            onError(err);
          }
        },
      );
    } catch (err) {
      if (!this.isTransactionActive) {
        await this.resetOptionsInDB();
      }
      throw err;
    }
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
