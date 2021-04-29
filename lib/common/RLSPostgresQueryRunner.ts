import {
  TenantId,
  TenancyModelOptions,
  ActorId,
} from 'lib/interfaces/tenant-options.interface';
import { PostgresDriver } from 'typeorm/driver/postgres/PostgresDriver';
import { PostgresQueryRunner } from 'typeorm/driver/postgres/PostgresQueryRunner';

export class RLSPostgresQueryRunner extends PostgresQueryRunner {
  tenantId: TenantId = null;
  actorId: ActorId = null;

  constructor(
    driver: PostgresDriver,
    mode,
    tenancyModelOptions: TenancyModelOptions,
  ) {
    super(driver, mode);
    this.tenantId = tenancyModelOptions.tenantId;
    this.actorId = tenancyModelOptions.actorId;
  }

  setOptions(tenancyModelOptions: TenancyModelOptions) {
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
