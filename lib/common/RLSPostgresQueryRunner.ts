import { ReplicationMode } from 'typeorm';
import { PostgresDriver } from 'typeorm/driver/postgres/PostgresDriver';
import { PostgresQueryRunner } from 'typeorm/driver/postgres/PostgresQueryRunner';
import {
  ActorId,
  TenancyModelOptions,
  TenantId,
} from '../interfaces/tenant-options.interface';

export class RLSPostgresQueryRunner extends PostgresQueryRunner {
  tenantId: TenantId = null;
  actorId: ActorId = null;

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

  async query(queryString: string, params?: any[]): Promise<any> {
    await super.query(
      `select set_config('settings.tenant_id', '${this.tenantId}', false)`,
    );
    await super.query(
      `select set_config('settings.actor_id', '${this.actorId}', false)`,
    );

    return await super.query(queryString, params);
  }
}
