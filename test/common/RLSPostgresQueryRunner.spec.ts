import {
  closeTestingConnections,
  reloadTestingDatabases,
  setupSingleTestingConnection,
} from '../util/test-utils';
import { Connection, createConnection, QueryFailedError } from 'typeorm';
import {
  RLSConnection,
  RLSPostgresDriver,
  RLSPostgresQueryRunner,
} from '../../lib/common';
import { TenancyModelOptions } from '../interfaces';
import { expect } from 'chai';
import * as sinon from 'sinon';
import { PostgresQueryRunner } from 'typeorm/driver/postgres/PostgresQueryRunner';
import { Post } from './entity/Post';
import { Category } from './entity/Category';
import {
  runQueryTests,
  setupMultiTenant,
  resetMultiTenant,
  setQueryRunnerRole,
  expectSameDataByTenantId,
  createRunners,
  generateQueryStrings,
  setupResolvers,
  releaseRunners,
} from '../util/helpers';

describe('RLSPostgresQueryRunner', () => {
  let connection: RLSConnection;
  let originalConnection: Connection;
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
      entities: [__dirname + '/entity/*{.js,.ts}'],
      dropSchema: true,
      schemaCreate: true,
    });

    originalConnection = await createConnection(connectionOptions);
    connection = new RLSConnection(originalConnection, fooTenant);
    driver = connection.driver;
  });
  beforeEach(async () => {
    await reloadTestingDatabases([connection]);
    queryRunner = new RLSPostgresQueryRunner(driver, 'master', fooTenant);
  });
  afterEach(async () => queryRunner.release());
  after(async () => await closeTestingConnections([originalConnection]));

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
      const testData = await setupMultiTenant(
        queryRunner,
        fooTenant,
        barTenant,
        tenantDbUser,
      );

      categories = testData.categories;
      posts = testData.posts;
    });
    afterEach(() => resetMultiTenant(queryRunner, tenantDbUser));

    describe('virtual connection', () => {
      it('should use the correct user', async () => {
        const [result] = await queryRunner.query(
          `select current_user as "currentUser"`,
        );

        expect(result.currentUser).to.be.equal(tenantDbUser);
      });

      it('should have the tenantId set', async () => {
        const [result] = await queryRunner.query(
          `select current_setting('settings.tenant_id') as "tenantId"`,
        );

        expect(parseInt(result.tenantId)).to.be.equal(fooTenant.tenantId);
      });

      it('should have the actor_id set', async () => {
        const [result] = await queryRunner.query(
          `select current_setting('settings.actor_id') as "actorId"`,
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
            `select current_setting('settings.tenant_id') as "tenantId"`,
          ),
        ).to.be.rejectedWith(
          QueryFailedError,
          /unrecognized configuration parameter "settings.tenant_id"/,
        );
      });

      it('should not have the actorId set', async () => {
        return expect(
          originalConnection.query(
            `select current_setting('settings.actor_id') as "actorId"`,
          ),
        ).to.be.rejectedWith(
          QueryFailedError,
          /unrecognized configuration parameter "settings.actor_id"/,
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

    describe.only('multiple-qr', () => {
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

        expectSameDataByTenantId(barCategories, categories, barTenant);
        expectSameDataByTenantId(fooCategories, categories, fooTenant);
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
        expectSameDataByTenantId(
          barTenantCategoryResult,
          categories,
          barTenant,
        );
        expect(pending).to.be.true;

        clock.tick(3000);
        const fooTenantCategoryResult = await fooTenantCategoryPromise;

        expect(pending).to.be.false;
        expectSameDataByTenantId(
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
            expectSameDataByTenantId(result, categories, tenantsOrder[indx]);
          });
        });

        await releaseRunners(createdRunners);
      });
    });
  });
});
