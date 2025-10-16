import { RLSConnection } from 'lib/common';
import { TenancyModelOptions } from 'lib/interfaces';
import { DataSource, DataSourceOptions } from 'typeorm';
import { Category } from '../entity/Category';
import { Post } from '../entity/Post';
import { createTeantUser, resetMultiTenant } from '../helpers';
import {
  closeConnections,
  getConnectionOptions,
  getTypeOrmConfig,
  resetDatabases,
} from '../test-utils';
import { CustomExecutionContext } from './context.interface';
import { User } from '../entity/User';

export class DataSourceHarness {
  private _migrationDataSource: DataSource;
  private _rlsDataSource: DataSource;
  private _singlePoolRlsDataSource: DataSource;
  private fooRlsConnection: RLSConnection;
  private barRlsConnection: RLSConnection;

  private readonly tenantDbUser = 'tenant_aware_user';

  setupHooks(fooTenant: TenancyModelOptions, barTenant: TenancyModelOptions) {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;

    before(async () => {
      this._migrationDataSource = await this.createConnection();

      await resetDatabases([this._migrationDataSource]);
      try {
        await createTeantUser(this._migrationDataSource, this.tenantDbUser);
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
      } catch (err) {
        /* if database is not cleaned up properly, we reset it first
         * and then create the tenant user. This is useful for running
         * tests locally which can leave the database in a dirty state
         * if they fail.
         */
        await resetMultiTenant(this._migrationDataSource, this.tenantDbUser);
        await createTeantUser(this._migrationDataSource, this.tenantDbUser);
      }

      this._rlsDataSource = await this.createConnection(
        'tenantAware',
        this.tenantDbUser,
      );
      this._singlePoolRlsDataSource = await this.createConnection(
        'singlePoolTenantAware',
        this.tenantDbUser,
        {
          poolSize: 1,
        },
      );

      this.fooRlsConnection = new RLSConnection(this._rlsDataSource, fooTenant);
      this.barRlsConnection = new RLSConnection(this._rlsDataSource, barTenant);
    });

    before(async function (this: CustomExecutionContext) {
      const context = this.test.parent;

      context.migrationDataSource = self._migrationDataSource;
      context.rlsDataSource = self._rlsDataSource;
      context.singlePoolRlsDataSource = self._singlePoolRlsDataSource;
      context.fooConnection = self.fooRlsConnection;
      context.barConnection = self.barRlsConnection;
      context.tenantDbUser = self.tenantDbUser;
    });

    after(async () => {
      await resetMultiTenant(this._migrationDataSource, this.tenantDbUser);
      await this.closeAllConnections();
    });
  }

  private async createConnection(
    name: string = 'default',
    username?: string,
    extra?: any,
  ): Promise<DataSource> {
    const config = getTypeOrmConfig();

    const connectionOptions = getConnectionOptions(
      'postgres',
      {
        entities: [Post, Category, User],
        dropSchema: config.dropSchema,
        schemaCreate: config.synchronize,
      },
      {
        ...config,
        name: name,
        username: username ?? config.username,
        extra: extra,
      } as DataSourceOptions,
    );

    return await new DataSource(connectionOptions).initialize();
  }

  private async closeAllConnections() {
    await closeConnections([
      this._rlsDataSource,
      this._singlePoolRlsDataSource,
      this._migrationDataSource,
    ]);
  }
}
