import { TenancyModelOptions } from 'lib/interfaces';
import { DataSourceHarness } from './connection';
import { SeedHarness } from './seed';
import { TenantHarness } from './tenant';

export class TestBootstrapHarness {
  dataSourceHarness = new DataSourceHarness();
  tenantHarness = new TenantHarness();
  seedHarness = new SeedHarness();

  setupHooks(fooTenant: TenancyModelOptions, barTenant: TenancyModelOptions) {
    this.dataSourceHarness.setupHooks(fooTenant, barTenant);
    this.tenantHarness.setupHooks();
    this.seedHarness.setupHooks(fooTenant, barTenant);
  }
}
