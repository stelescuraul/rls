import { expect } from 'chai';
import sinon = require('sinon');
import { DataSource, DataSourceOptions } from 'typeorm';
import { PostgresDriver } from 'typeorm/driver/postgres/PostgresDriver';
import { PostgresQueryRunner } from 'typeorm/driver/postgres/PostgresQueryRunner';
import { RLSConnection } from '../../lib/common';
import { TenancyModelOptions } from '../interfaces';
import {
  createData,
  createTeantUser,
  expectPostDataRelation,
  expectTenantData,
  expectTenantDataEventually,
  resetMultiTenant,
  setupMultiTenant,
} from '../util/helpers';
import {
  closeTestingConnections,
  getTypeOrmConfig,
  reloadTestingDatabases,
  setupSingleTestingConnection,
} from '../util/test-utils';
import { Category } from '../util/entity/Category';
import { Post } from '../util/entity/Post';

const configs = getTypeOrmConfig();

describe('EntityManager', function () {
  const tenantDbUser = 'tenant_aware_user';
  let fooConnection: RLSConnection;
  let barConnection: RLSConnection;
  let migrationConnection: DataSource;
  let tenantUserConnection: DataSource;
  let categories: Category[];
  let posts: Post[];

  const fooTenant: TenancyModelOptions = {
    actorId: 10,
    tenantId: 1,
  };

  const barTenant: TenancyModelOptions = {
    actorId: 20,
    tenantId: 2,
  };

  before(async () => {
    const migrationConnectionOptions = await setupSingleTestingConnection(
      'postgres',
      {
        entities: [Post, Category],
        dropSchema: true,
        schemaCreate: true,
      },
    );
    const tenantAwareConnectionOptions = await setupSingleTestingConnection(
      'postgres',
      {
        entities: [Post, Category],
      },
      {
        ...configs[0],
        name: 'tenantAware',
        username: tenantDbUser,
      } as DataSourceOptions,
    );

    migrationConnection = await new DataSource(
      migrationConnectionOptions,
    ).initialize();
    await createTeantUser(migrationConnection, tenantDbUser);

    tenantUserConnection = await new DataSource(
      tenantAwareConnectionOptions,
    ).initialize();
    fooConnection = new RLSConnection(tenantUserConnection, fooTenant);
    barConnection = new RLSConnection(tenantUserConnection, barTenant);
  });
  beforeEach(async () => {
    await reloadTestingDatabases([migrationConnection]);
    await setupMultiTenant(migrationConnection, tenantDbUser);

    const testData = await createData(
      fooTenant,
      barTenant,
      migrationConnection,
    );
    categories = testData.categories;
    posts = testData.posts;
  });
  after(async () => {
    await resetMultiTenant(migrationConnection, tenantDbUser);
    await closeTestingConnections([migrationConnection, tenantUserConnection]);
  });

  it('should return different entityManagers', () => {
    const fooEntityManager = fooConnection.createEntityManager();
    const barEntityManager = barConnection.createEntityManager();
    const entityManager = migrationConnection.createEntityManager();

    expect(fooEntityManager).to.not.deep.equal(entityManager);
    expect(barEntityManager).to.not.deep.equal(entityManager);
    expect(fooEntityManager).to.not.deep.equal(barEntityManager);
  });

  it('should apply RLS to entityManager', async () => {
    const fooEntityManager = fooConnection.createEntityManager();
    const barEntityManager = barConnection.createEntityManager();
    const entityManager = migrationConnection.createEntityManager();

    await expectTenantDataEventually(
      expect(fooEntityManager.find(Post)),
      posts,
      1,
      fooTenant,
    );
    await expectTenantDataEventually(
      expect(barEntityManager.find(Post)),
      posts,
      1,
      barTenant,
    );

    await expect(entityManager.find(Post)).to.eventually.have.lengthOf(3);
  });

  it('should apply RLS to multiple parallel entityManagers', async () => {
    const fooEntityManager = fooConnection.createEntityManager();
    const barEntityManager = barConnection.createEntityManager();
    const entityManager = migrationConnection.createEntityManager();

    await expectTenantDataEventually(
      expect(fooEntityManager.find(Category)),
      categories,
      1,
      fooTenant,
    );
    await expectTenantDataEventually(
      expect(barEntityManager.find(Category)),
      categories,
      1,
      barTenant,
    );

    const fooCategoryFindProm = fooEntityManager.find(Category);
    const barCategoryFindProm = barEntityManager.find(Category);
    const categoryFindProm = entityManager.find(Category);

    // execute them in parallel, the results should still be correct
    await Promise.all([
      fooCategoryFindProm,
      barCategoryFindProm,
      categoryFindProm,
    ]).then(async ([foo, bar, cat]) => {
      await expectTenantData(expect(foo), categories, 1, fooTenant);
      await expectTenantData(expect(bar), categories, 1, barTenant);
      await expect(cat).to.have.lengthOf(2).and.to.deep.equal(categories);
    });
  });

  it('should apply RLS to relation queries', async () => {
    const fooEntityManager = fooConnection.createEntityManager();
    const barEntityManager = barConnection.createEntityManager();
    const entityManager = migrationConnection.createEntityManager();

    await expectPostDataRelation(
      expect(
        fooEntityManager.find(Post, {
          relations: {
            categories: true,
          },
        }),
      ),
      posts,
      1,
      fooTenant,
    );
    await expectPostDataRelation(
      expect(
        barEntityManager.find(Post, {
          relations: {
            categories: true,
          },
        }),
      ),
      posts,
      1,
      barTenant,
    );

    const fooPostFindProm = fooEntityManager.find(Post, {
      relations: {
        categories: true,
      },
    });
    const barPostFindProm = barEntityManager.find(Post, {
      relations: {
        categories: true,
      },
    });
    const postFindProm = entityManager.find(Post, {
      relations: {
        categories: true,
      },
    });

    // execute them in parallel, the results should still be correct
    await Promise.all([fooPostFindProm, barPostFindProm, postFindProm]).then(
      async ([foo, bar, cat]) => {
        await expectPostDataRelation(expect(foo), posts, 1, fooTenant, false);
        await expectPostDataRelation(expect(bar), posts, 1, barTenant, false);

        await expect(cat)
          .to.have.lengthOf(3)
          .satisfy((arr: Post[]) => arr.every(a => !!a.categories))
          .and.to.deep.equal(posts);
      },
    );
  });

  describe('same entityManager with multiple queries', () => {
    it('should apply RLS queries to each find', async () => {
      const fooEntityManager = fooConnection.createEntityManager();

      const promises = new Array(10000)
        .fill(null)
        .map(() => fooEntityManager.find(Category));
      await expect(Promise.all(promises))
        .to.eventually.be.fulfilled.and.have.lengthOf(10000)
        .and.to.satisfy((arr: any[]) => {
          return arr.every(cat =>
            expectTenantData(expect(cat), categories, 1, fooTenant),
          );
        });
    });
  });

  describe('queued queries', () => {
    let queryPrototypeSpy: sinon.SinonSpy;
    let connectedQueryRunnersStub: sinon.SinonStub;

    beforeEach(() => {
      queryPrototypeSpy = sinon.spy(PostgresQueryRunner.prototype, 'query');

      connectedQueryRunnersStub = sinon
        .stub(
          (tenantUserConnection.driver as PostgresDriver).connectedQueryRunners,
          'push',
        )
        .callThrough();
    });
    afterEach(() => {
      sinon.restore();
    });

    it('should apply RLS to queued queries', async () => {
      const fooEntityManager = fooConnection.createEntityManager();
      const barEntityManager = barConnection.createEntityManager();

      const promises = [];

      const connectedQueryRunnersLengthHistory = [];

      connectedQueryRunnersStub.callsFake((...args) => {
        const len = connectedQueryRunnersStub.wrappedMethod.bind(
          (tenantUserConnection.driver as PostgresDriver).connectedQueryRunners,
        )(...args);
        connectedQueryRunnersLengthHistory.push(len);
        return len;
      });

      for (let i = 0; i < 20; i++) {
        if (i % 2 === 0) {
          promises.push(fooEntityManager.find(Category));
        } else {
          promises.push(barEntityManager.find(Category));
        }
      }

      await Promise.all(promises).then(async results => {
        let i = 0;
        // should have 4 queries per call * 20 queries
        await expect(queryPrototypeSpy).to.have.callCount(60);

        // should have had 20 calls in total. One per query
        await expect(connectedQueryRunnersStub).to.have.callCount(20);
        for (const result of results) {
          if (i % 2 === 0) {
            await expectTenantData(expect(result), categories, 1, fooTenant);
          } else {
            await expectTenantData(expect(result), categories, 1, barTenant);
          }
          i += 1;
        }
      });
      // should have been 20 total query runners added over time
      expect(connectedQueryRunnersLengthHistory).to.have.lengthOf(20);
    });
  });

  describe('transaction', () => {
    it('should apply RLS to transaction', async () => {
      const fooEntityManager = fooConnection.createEntityManager();
      const barEntityManager = barConnection.createEntityManager();

      await fooEntityManager.transaction(async tem => {
        await expectTenantDataEventually(
          expect(tem.find(Category)),
          categories,
          1,
          fooTenant,
        );
      });

      await barEntityManager.transaction(async tem => {
        await expectTenantDataEventually(
          expect(tem.find(Category)),
          categories,
          1,
          barTenant,
        );
      });
    });

    it('should apply RLS to parallel transactions', async () => {
      const fooEntityManager = fooConnection.createEntityManager();
      const barEntityManager = barConnection.createEntityManager();

      const fooProm = fooEntityManager.transaction(async tem => {
        await expectTenantDataEventually(
          expect(tem.find(Category)),
          categories,
          1,
          fooTenant,
        );
      });

      const barProm = barEntityManager.transaction(
        async tem =>
          await expectTenantDataEventually(
            expect(tem.find(Category)),
            categories,
            1,
            barTenant,
          ),
      );

      return Promise.all([fooProm, barProm]);
    });
  });

  describe('connection pool with size 1', () => {
    let singleConnection: DataSource;
    let fooRlsSingleConnection: RLSConnection;

    before(async () => {
      const tenantConnectionOptions = setupSingleTestingConnection(
        'postgres',
        {
          entities: [Post, Category],
        },
        {
          ...configs[0],
          name: 'tenantConnection',
          extra: {
            size: 1,
          },
          username: tenantDbUser,
          logging: false,
        } as DataSourceOptions,
      );

      singleConnection = await new DataSource(
        tenantConnectionOptions,
      ).initialize();
      fooRlsSingleConnection = new RLSConnection(singleConnection, fooTenant);
    });

    after(async () => await closeTestingConnections([singleConnection]));

    describe('same entityManager with multiple queries', () => {
      it('should apply RLS queries to each find', async () => {
        const fooEntityManager = fooRlsSingleConnection.createEntityManager();

        const promises = new Array(1000)
          .fill(null)
          .map(() => fooEntityManager.find(Category));

        await expect(Promise.all(promises))
          .to.eventually.be.fulfilled.and.have.lengthOf(1000)
          .and.to.satisfy((arr: any[]) => {
            return arr.every(cat =>
              expectTenantData(expect(cat), categories, 1, fooTenant),
            );
          });
      });
    });
  });
});
