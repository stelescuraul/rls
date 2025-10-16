import { TenancyModelOptions } from 'lib/interfaces';
import { createData } from '../helpers';
import { CustomExecutionContext } from './context.interface';

export class SeedHarness {
  setupHooks(fooTenant: TenancyModelOptions, barTenant: TenancyModelOptions) {
    beforeEach(async function (this: CustomExecutionContext) {
      const context = this.test.parent;

      const testData = await createData(
        fooTenant,
        barTenant,
        context.migrationDataSource,
      );

      context.categories = testData.categories;
      context.posts = testData.posts;
    });
  }
}
