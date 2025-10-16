import { setupMultiTenant } from '../helpers';
import { resetDatabases } from '../test-utils';
import { CustomExecutionContext } from './context.interface';

export class TenantHarness {
  setupHooks() {
    beforeEach(async function (this: CustomExecutionContext) {
      const context = this.test.parent;

      await resetDatabases([context.migrationDataSource]);
      await setupMultiTenant(context.migrationDataSource, 'tenant_aware_user');
    });
  }
}
