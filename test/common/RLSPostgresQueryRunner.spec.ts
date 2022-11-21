import { expect } from 'chai';
import * as sinon from 'sinon';
import {
  Connection,
  ConnectionOptions,
  createConnection,
  QueryFailedError,
} from 'typeorm';
import { PostgresQueryRunner } from 'typeorm/driver/postgres/PostgresQueryRunner';
import {
  RLSConnection,
  RLSPostgresDriver,
  RLSPostgresQueryRunner,
} from '../../lib/common';
import { TenancyModelOptions } from '../interfaces';
import { Category } from '../util/entity/Category';
import { Post } from '../util/entity/Post';
import {
  createData,
  createRunners,
  createTeantUser,
  expectSameCategoryByTenantId,
  generateQueryStrings,
  releaseRunners,
  resetMultiTenant,
  runQueryTests,
  setQueryRunnerRole,
  setupMultiTenant,
  setupResolvers,
} from '../util/helpers';
import {
  closeTestingConnections,
  getTypeOrmConfig,
  reloadTestingDatabases,
  setupSingleTestingConnection,
} from '../util/test-utils';
const configs = getTypeOrmConfig();

describe('RLSPostgresQueryRunner', () => {
  let connection: RLSConnection;
  let originalConnection: Connection;
  let migrationConnection: Connection;
  let driver: RLSPostgresDriver;

  let queryRunner: RLSPostgresQueryRunner;

  const fooTenant: TenancyModelOptions = {
    actorId: 10,
    tenantId: 1,
  };

  const barTenant: TenancyModelOptions = {
    actorId: 20,
    tenantId: 2,
  };

  before(async () => {
    const connectionOptions = await setupSingleTestingConnection('postgres', {
      entities: [Post, Category],
      dropSchema: true,
      schemaCreate: true,
    });

    const migrationConnectionOptions = await setupSingleTestingConnection(
      'postgres',
      {
        entities: [Post, Category],
      },
      {
        ...configs[0],
        name: 'migrationConnection',
      } as ConnectionOptions,
    );

    originalConnection = await createConnection(connectionOptions);
    migrationConnection = await createConnection(migrationConnectionOptions);

    connection = new RLSConnection(originalConnection, fooTenant);
    driver = connection.driver;
  });
  beforeEach(async () => {
    await reloadTestingDatabases([migrationConnection]);
    queryRunner = new RLSPostgresQueryRunner(driver, 'master', fooTenant);
  });
  afterEach(async () => await queryRunner.release());
  after(
    async () =>
      await closeTestingConnections([originalConnection, migrationConnection]),
  );

  it('should be instance of RLSPostgresQueryRunner', () => {
    expect(queryRunner).to.be.instanceOf(RLSPostgresQueryRunner);
    expect(connection.createQueryRunner()).to.be.instanceOf(
      RLSPostgresQueryRunner,
    );
    expect(driver.createQueryRunner('master')).to.be.instanceOf(
      RLSPostgresQueryRunner,
    );
  });

  it('should not be singleton instance', () => {
    expect(queryRunner).to.not.equal(
      new RLSPostgresQueryRunner(driver, 'master', fooTenant),
    );
    expect(queryRunner).to.not.equal(connection.createQueryRunner());
    expect(queryRunner).to.not.equal(driver.createQueryRunner('master'));
  });

  it('should have the tenant and actor set', () => {
    expect(queryRunner).to.have.property('actorId').and.to.be.equal(10);
    expect(queryRunner).to.have.property('tenantId').and.to.be.equal(1);
  });

  it('should use the RLSConnection', () => {
    expect(queryRunner)
      .to.have.property('connection')
      .and.deep.equal(connection);
    expect(queryRunner)
      .to.have.property('connection')
      .and.be.instanceOf(RLSConnection);
  });

  describe('#query', () => {
    describe('$RLSPostgresQueryRunner', () => {
      runQueryTests(
        fooTenant,
        () => new RLSPostgresQueryRunner(driver, 'master', fooTenant),
      );
    });

    describe('$RLSPostgresDriver', () => {
      runQueryTests(fooTenant, () => driver.createQueryRunner('master'));
    });

    describe('$RLSConnection', () => {
      runQueryTests(fooTenant, () => connection.createQueryRunner());
    });
  });

  describe('multi-tenant', () => {
    const tenantDbUser = 'tenant_aware_user';
    let categories: Category[];
    let posts: Post[];

    beforeEach(async () => {
      await createTeantUser(migrationConnection, tenantDbUser);
      await setupMultiTenant(migrationConnection, tenantDbUser);

      await setQueryRunnerRole(queryRunner, tenantDbUser);

      const testData = await createData(
        fooTenant,
        barTenant,
        migrationConnection,
      );

      categories = testData.categories;
      posts = testData.posts;
    });

    afterEach(async () => {
      await resetMultiTenant(migrationConnection, tenantDbUser);
    });

    describe('virtual connection', () => {
      it('should use the correct database user', async () => {
        const [result] = await queryRunner.query(
          `select current_user as "currentUser"`,
        );

        expect(result.currentUser).to.be.equal(tenantDbUser);
      });

      it('should have the tenantId set', async () => {
        const [result] = await queryRunner.query(
          `select current_setting('rls.tenant_id') as "tenantId"`,
        );

        expect(parseInt(result.tenantId)).to.be.equal(fooTenant.tenantId);
      });

      it('should have the actor_id set', async () => {
        const [result] = await queryRunner.query(
          `select current_setting('rls.actor_id') as "actorId"`,
        );

        expect(parseInt(result.actorId)).to.be.equal(fooTenant.actorId);
      });

      it('should return the right category', async () => {
        return expect(queryRunner.query(`select * from category`))
          .to.eventually.have.lengthOf(1)
          .and.to.deep.equal(
            categories
              .filter(x => x.tenantId === fooTenant.tenantId)
              .map(x => x.toJson()),
          );
      });

      it('should return the right posts', async () => {
        return expect(queryRunner.query(`select * from post`))
          .to.eventually.have.lengthOf(1)
          .and.to.deep.equal(
            posts
              .filter(
                x =>
                  x.tenantId === fooTenant.tenantId &&
                  x.userId === fooTenant.actorId,
              )
              .map(x => x.toJson()),
          );
      });

      it('should not overwrite the tenantId', async () => {
        return expect(
          queryRunner.query(`select * from category where "tenantId" in ($1)`, [
            categories
              .filter(x => x.tenantId !== fooTenant.tenantId)
              .map(x => x.tenantId)
              .join(','),
          ]),
        ).to.eventually.have.lengthOf(0);
      });

      it('should not overwrite the tenantId or actorId', async () => {
        return expect(
          queryRunner.query(
            `select * from post where "tenantId" in ($1) or "userId" in ($2)`,
            [barTenant.tenantId, barTenant.actorId],
          ),
        ).to.eventually.have.lengthOf(0);
      });

      it('should not allow to insert for any tenant', async () => {
        return expect(
          queryRunner.query(
            `insert into category values (default, 66, 'not allowed')`,
          ),
        ).to.be.rejectedWith(
          QueryFailedError,
          /new row violates row-level security policy for table "category"/,
        );
      });

      it('should allow to insert for the right tenant', async () => {
        await expect(
          queryRunner.query(
            `insert into category values (default, $1, 'allowed')`,
            [fooTenant.tenantId],
          ),
        ).to.be.fulfilled;

        return expect(
          queryRunner.query(`select * from category where name = 'allowed'`),
        ).to.eventually.have.lengthOf(1);
      });

      it('should not allow to insert for wrong actorId', async () => {
        return expect(
          queryRunner.query(
            `insert into post values (default, $1, $2, 'not allowed')`,
            [fooTenant.tenantId, 11],
          ),
        ).to.be.rejectedWith(
          QueryFailedError,
          /new row violates row-level security policy for table "post"/,
        );
      });

      it(`should allow to insert for right actorId`, async () => {
        await expect(
          queryRunner.query(
            `insert into post values (default, $1, $2, 'allowed')`,
            [fooTenant.tenantId, fooTenant.actorId],
          ),
        ).to.be.fulfilled;

        return expect(
          queryRunner.query(`select * from post where title = 'allowed'`),
        ).to.eventually.have.lengthOf(1);
      });

      it(`should only update the tenant's data`, async () => {
        await queryRunner.query(`update category set name = 'allowed'`);

        return expect(
          originalConnection.query(
            `select * from category where name = 'allowed'`,
          ),
        ).to.eventually.have.lengthOf(1);
      });

      it(`should only update the right actor's data`, async () => {
        await queryRunner.query(`update post set title = 'allowed'`);

        return expect(
          originalConnection.query(
            `select * from post where title = 'allowed'`,
          ),
        ).to.eventually.have.lengthOf(1);
      });
    });

    describe('original connection', () => {
      it('should use postgres user', async () => {
        const [result] = await originalConnection.query(
          `select current_user as "currentUser"`,
        );

        expect(result.currentUser).to.be.equal('postgres');
      });

      it('should not have the tenantId set', async () => {
        return expect(
          originalConnection.query(
            `select current_setting('rls.tenant_id') as "tenantId"`,
          ),
        ).to.be.rejectedWith(
          QueryFailedError,
          /unrecognized configuration parameter "rls.tenant_id"/,
        );
      });

      it('should not have the actorId set', async () => {
        return expect(
          originalConnection.query(
            `select current_setting('rls.actor_id') as "actorId"`,
          ),
        ).to.be.rejectedWith(
          QueryFailedError,
          /unrecognized configuration parameter "rls.actor_id"/,
        );
      });

      it('should return all categories', () => {
        return expect(originalConnection.query(`select * from category`))
          .to.eventually.have.lengthOf(2)
          .and.to.be.deep.equal(categories.map(x => x.toJson()));
      });

      it('should return all posts', () => {
        return expect(originalConnection.query(`select * from post`))
          .to.eventually.have.lengthOf(3)
          .and.to.be.deep.equal(posts.map(x => x.toJson()));
      });

      it('should allow to insert for any tenant', async () => {
        await originalConnection.query(
          `insert into category values (default, 66, 'allowed')`,
        );

        return expect(
          originalConnection.query(
            `select * from category where "tenantId" = 66`,
          ),
        ).to.eventually.have.lengthOf(1);
      });

      it('should allow to insert for any actor', async () => {
        await originalConnection.query(
          `insert into post values (default, 66, 66, 'allowed')`,
        );

        return expect(
          originalConnection.query(`select * from post where "userId" = 66`),
        ).to.eventually.have.lengthOf(1);
      });

      it('should be allowed to update for any tenant', async () => {
        await originalConnection.query(`update category set name = 'allowed'`);

        return expect(
          originalConnection.query(`select * from category`),
        ).to.eventually.have.lengthOf(2);
      });
    });

    describe('multiple-qr', () => {
      let localQueryRunner: RLSPostgresQueryRunner;
      let queryPrototypeStub: sinon.SinonStub;
      let clock: sinon.SinonFakeTimers;
      const fooQueryString = `select * from category as c_foo`;
      const barQueryString = `select * from category as c_bar`;

      beforeEach(async () => {
        // The connection and driver are reused but
        // for the purpose of this test, it should be alright
        localQueryRunner = new RLSPostgresQueryRunner(
          driver,
          'master',
          barTenant,
        );
        await setQueryRunnerRole(localQueryRunner, tenantDbUser);

        // By default allow the queries to go through
        queryPrototypeStub = sinon
          .stub(PostgresQueryRunner.prototype, 'query')
          .callThrough();

        clock = sinon.useFakeTimers();
      });

      afterEach(async () => {
        sinon.restore();
        clock.restore();
        await localQueryRunner.release();
      });

      it('should have 6 calls in total', async () => {
        await queryRunner.query(fooQueryString);
        await localQueryRunner.query(barQueryString);

        expect(queryPrototypeStub).to.have.callCount(6);
      });

      it('should return the right categories', async () => {
        const fooCategories = await queryRunner.query(fooQueryString);
        const barCategories = await localQueryRunner.query(barQueryString);

        expectSameCategoryByTenantId(barCategories, categories, barTenant);
        expectSameCategoryByTenantId(fooCategories, categories, fooTenant);
      });

      it('should not have race conditions when first query takes longer', async () => {
        let pending = true;

        const fooCategoryQueryRunnerResolver = sinon.fake.resolves(
          new Promise(resolve => {
            return setTimeout(async () => {
              resolve(
                queryPrototypeStub.wrappedMethod.bind(queryRunner)(
                  fooQueryString,
                ),
              );
            }, 3000);
          }),
        );

        queryPrototypeStub
          .withArgs(fooQueryString)
          .resolves(fooCategoryQueryRunnerResolver());

        const fooTenantCategoryPromise = queryRunner.query(fooQueryString);
        fooTenantCategoryPromise.finally(() => (pending = false));

        // This should return first
        // It will still be registered in stub
        const barTenantCategoryResult = await localQueryRunner.query(
          barQueryString,
        );

        expect(queryPrototypeStub).to.have.been.calledWith(barQueryString);
        expectSameCategoryByTenantId(
          barTenantCategoryResult,
          categories,
          barTenant,
        );
        expect(pending).to.be.true;

        clock.tick(3000);
        const fooTenantCategoryResult = await fooTenantCategoryPromise;

        expect(pending).to.be.false;
        expectSameCategoryByTenantId(
          fooTenantCategoryResult,
          categories,
          fooTenant,
        );

        // The stub should have 6 calls in total
        // 3 for each query
        expect(queryPrototypeStub).to.have.callCount(6);
      });

      it('should not have race conditions on multiple runners', async () => {
        const tenantsOrder = [
          fooTenant,
          barTenant,
          fooTenant,
          fooTenant,
          barTenant,
          barTenant,
          fooTenant,
        ];

        const createdRunners = await createRunners(
          // The first 2 queryRunners are already created
          // queryRunner and localQueryRunner
          tenantsOrder.slice(2),
          tenantDbUser,
          driver,
        );

        const runners = [queryRunner, localQueryRunner, ...createdRunners];

        const queryStrings = await generateQueryStrings(7);
        await setupResolvers(runners, queryStrings, queryPrototypeStub);

        let queryPromises = [];

        for (let i = 0; i < runners.length; i++) {
          queryPromises.push(runners[i].query(queryStrings[i]));
        }

        queryPromises = queryPromises.map(async promise => {
          clock.tick(1000);
          return await promise;
        });

        await Promise.all(queryPromises).then(results => {
          results.forEach((result, indx) => {
            expectSameCategoryByTenantId(
              result,
              categories,
              tenantsOrder[indx],
            );
          });
        });

        await releaseRunners(createdRunners);
      });
    });
  });

  describe('connection pool with size 1', () => {
    const tenantDbUser = 'tenant_aware_user';
    let singleConnection: Connection;
    let fooRlsConnection: RLSConnection;
    let singleQueryRunner: RLSPostgresQueryRunner;
    let localDriver: RLSPostgresDriver;

    before(async () => {
      const tenantConnectionOptions = await setupSingleTestingConnection(
        'postgres',
        {
          entities: [Post, Category],
          logging: false,
        },
        {
          ...configs[0],
          name: 'tenantConnection',
          extra: {
            size: 1,
          },
          logging: false,
        } as ConnectionOptions,
      );

      singleConnection = await createConnection(tenantConnectionOptions);
      fooRlsConnection = new RLSConnection(singleConnection, fooTenant);
      localDriver = fooRlsConnection.driver;
    });

    beforeEach(async () => {
      singleQueryRunner = new RLSPostgresQueryRunner(
        localDriver,
        'master',
        fooTenant,
      );

      await createTeantUser(migrationConnection, tenantDbUser);
      await setupMultiTenant(migrationConnection, tenantDbUser);
      await setQueryRunnerRole(singleQueryRunner, tenantDbUser);
      await createData(fooTenant, barTenant, migrationConnection);
    });

    afterEach(async () => {
      await resetMultiTenant(migrationConnection, tenantDbUser);
      await singleQueryRunner.release();
    });

    after(async () => await closeTestingConnections([singleConnection]));

    it('should not persist the settings in connection from the pool', async () => {
      // Force throwing an error in the query
      await expect(singleQueryRunner.query('select * from non_existing_table'))
        .to.eventually.be.rejectedWith(
          `relation "non_existing_table" does not exist`,
        )
        .and.be.instanceOf(QueryFailedError);
      await singleQueryRunner.release();

      // Since we released the queryrunner back in the pool, when we create a new one
      // we in fact receive the one used above from pg pool
      const queryRunner2 = singleConnection.createQueryRunner();

      /**
       * Since this query is not RLS bound, this will return the set tenant
       * If the reset executes (therefore not leaking),
       * the tenantId and actorId properties should be empty
       */
      const [{ tenantId }] = await queryRunner2.query(
        `select current_setting('rls.tenant_id') as "tenantId"`,
      );
      expect(tenantId).to.be.empty;

      const [{ actorId }] = await queryRunner2.query(
        `select current_setting('rls.actor_id') as "actorId"`,
      );
      expect(actorId).to.be.empty;

      /**
       * Executing a query that is RLS bound should fail because
       * tenant_id and actor_id needed by the RLS policy should not
       * be set. They are only set if the connection is not reset correctly
       */
      await expect(
        queryRunner2.query('select * from category'),
      ).to.eventually.be.rejectedWith(/invalid input syntax/);
      await queryRunner2.release();
    });
  });
});
