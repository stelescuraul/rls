import { expect } from 'chai';
import * as Sinon from 'sinon';
import { CustomSuite } from 'test/util/harness';
import { TestBootstrapHarness } from 'test/util/harness/testBootstrap';
import { PostgresDriver } from 'typeorm/driver/postgres/PostgresDriver';
import { PostgresQueryRunner } from 'typeorm/driver/postgres/PostgresQueryRunner';
import { TenancyModelOptions } from '../interfaces';
import { Category } from '../util/entity/Category';
import { Post } from '../util/entity/Post';
import {
  expectPostDataRelation,
  expectTenantData,
  expectTenantDataEventually,
} from '../util/helpers';

describe('EntityManager', function (this: CustomSuite) {
  const testBootstrapHarness = new TestBootstrapHarness();

  const fooTenant: TenancyModelOptions = {
    actorId: 10,
    tenantId: 1,
  };

  const barTenant: TenancyModelOptions = {
    actorId: 20,
    tenantId: 2,
  };

  testBootstrapHarness.setupHooks(fooTenant, barTenant);

  it('should return different entityManagers', () => {
    const fooEntityManager = this.fooConnection.createEntityManager();
    const barEntityManager = this.barConnection.createEntityManager();
    const entityManager = this.migrationDataSource.createEntityManager();

    expect(fooEntityManager).to.not.deep.equal(entityManager);
    expect(barEntityManager).to.not.deep.equal(entityManager);
    expect(fooEntityManager).to.not.deep.equal(barEntityManager);
  });

  it('should apply RLS to entityManager', async () => {
    const fooEntityManager = this.fooConnection.createEntityManager();
    const barEntityManager = this.barConnection.createEntityManager();
    const entityManager = this.migrationDataSource.createEntityManager();

    await expectTenantDataEventually(
      expect(fooEntityManager.find(Post)),
      this.posts,
      1,
      fooTenant,
    );
    await expectTenantDataEventually(
      expect(barEntityManager.find(Post)),
      this.posts,
      1,
      barTenant,
    );

    await expect(entityManager.find(Post)).to.eventually.have.lengthOf(3);
  });

  it('should apply RLS to multiple parallel entityManagers', async () => {
    const fooEntityManager = this.fooConnection.createEntityManager();
    const barEntityManager = this.barConnection.createEntityManager();
    const entityManager = this.migrationDataSource.createEntityManager();

    await expectTenantDataEventually(
      expect(fooEntityManager.find(Category)),
      this.categories,
      1,
      fooTenant,
    );
    await expectTenantDataEventually(
      expect(barEntityManager.find(Category)),
      this.categories,
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
      expectTenantData(expect(foo), this.categories, 1, fooTenant);
      expectTenantData(expect(bar), this.categories, 1, barTenant);
      expect(cat).to.have.lengthOf(2).and.to.deep.equal(this.categories);
    });
  });

  it('should apply RLS to relation queries', async () => {
    const fooEntityManager = this.fooConnection.createEntityManager();
    const barEntityManager = this.barConnection.createEntityManager();
    const entityManager = this.migrationDataSource.createEntityManager();

    await expectPostDataRelation(
      expect(
        fooEntityManager.find(Post, {
          relations: {
            categories: true,
          },
        }),
      ),
      this.posts,
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
      this.posts,
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
        await expectPostDataRelation(
          expect(foo),
          this.posts,
          1,
          fooTenant,
          false,
        );
        await expectPostDataRelation(
          expect(bar),
          this.posts,
          1,
          barTenant,
          false,
        );

        expect(cat)
          .to.have.lengthOf(3)
          .satisfy((arr: Post[]) => arr.every(a => !!a.categories))
          .and.to.deep.equal(this.posts);
      },
    );
  });

  describe('queued queries', () => {
    let queryPrototypeSpy: Sinon.SinonSpy;
    let connectedQueryRunnersStub: sinon.SinonStub;

    beforeEach(() => {
      queryPrototypeSpy = Sinon.spy(PostgresQueryRunner.prototype, 'query');

      connectedQueryRunnersStub = Sinon.stub(
        (this.rlsDataSource.driver as PostgresDriver).connectedQueryRunners,
        'push',
      ).callThrough();
    });
    afterEach(() => {
      Sinon.restore();
    });

    it('should apply RLS to queued queries', async () => {
      const fooEntityManager = this.fooConnection.createEntityManager();
      const barEntityManager = this.barConnection.createEntityManager();

      const promises = [];

      const connectedQueryRunnersLengthHistory = [];

      connectedQueryRunnersStub.callsFake((...args) => {
        const len = connectedQueryRunnersStub.wrappedMethod.bind(
          (this.rlsDataSource.driver as PostgresDriver).connectedQueryRunners,
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
        expect(queryPrototypeSpy).to.have.callCount(60);

        // should have had 20 calls in total. One per query
        expect(connectedQueryRunnersStub).to.have.callCount(20);
        for (const result of results) {
          if (i % 2 === 0) {
            expectTenantData(expect(result), this.categories, 1, fooTenant);
          } else {
            expectTenantData(expect(result), this.categories, 1, barTenant);
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
      const fooEntityManager = this.fooConnection.createEntityManager();
      const barEntityManager = this.barConnection.createEntityManager();

      await fooEntityManager.transaction(async tem => {
        await expectTenantDataEventually(
          expect(tem.find(Category)),
          this.categories,
          1,
          fooTenant,
        );
      });

      await barEntityManager.transaction(async tem => {
        await expectTenantDataEventually(
          expect(tem.find(Category)),
          this.categories,
          1,
          barTenant,
        );
      });
    });

    it('should apply RLS to parallel transactions', async () => {
      const fooEntityManager = this.fooConnection.createEntityManager();
      const barEntityManager = this.barConnection.createEntityManager();

      const fooProm = fooEntityManager.transaction(async tem => {
        await expectTenantDataEventually(
          expect(tem.find(Category)),
          this.categories,
          1,
          fooTenant,
        );
      });

      const barProm = barEntityManager.transaction(
        async tem =>
          await expectTenantDataEventually(
            expect(tem.find(Category)),
            this.categories,
            1,
            barTenant,
          ),
      );

      return Promise.all([fooProm, barProm]);
    });
  });
});
