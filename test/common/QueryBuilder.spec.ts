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

describe('QueryBuilder', function (this: CustomSuite) {
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

  it('should return different queryBuilders', () => {
    const fooQueryBuilder = this.fooConnection.createQueryBuilder(Post, 'post');
    const barQueryBuilder = this.barConnection.createQueryBuilder(Post, 'post');
    const queryBuilder = this.migrationDataSource.createQueryBuilder(
      Post,
      'post',
    );

    expect(fooQueryBuilder).to.not.deep.equal(queryBuilder);
    expect(barQueryBuilder).to.not.deep.equal(queryBuilder);
    expect(fooQueryBuilder).to.not.deep.equal(barQueryBuilder);
  });

  it('should apply RLS to queryBuilder', async () => {
    const fooPostQueryBuilder = this.fooConnection
      .createQueryBuilder(Post, 'post')
      .leftJoinAndSelect('post.categories', 'category');
    const barPostQueryBuilder = this.barConnection
      .createQueryBuilder(Post, 'post')
      .leftJoinAndSelect('post.categories', 'category');
    const postQueryBuilder = this.migrationDataSource
      .createQueryBuilder(Post, 'post')
      .leftJoinAndSelect('post.categories', 'category');

    await expectTenantDataEventually(
      expect(fooPostQueryBuilder.getMany()),
      this.posts,
      1,
      fooTenant,
    );
    await expectTenantDataEventually(
      expect(barPostQueryBuilder.getMany()),
      this.posts,
      1,
      barTenant,
    );
    await expect(postQueryBuilder.getMany()).to.eventually.have.lengthOf(3);
  });

  it('should apply RLS to multiple parallel queryBuilders', async () => {
    const fooPostQueryBuilder = this.fooConnection.createQueryBuilder(
      Category,
      'categories',
    );
    const barPostQueryBuilder = this.barConnection.createQueryBuilder(
      Category,
      'categories',
    );
    const postQueryBuilder = this.migrationDataSource.createQueryBuilder(
      Category,
      'categories',
    );

    await expectTenantDataEventually(
      expect(fooPostQueryBuilder.getMany()),
      this.categories,
      1,
      fooTenant,
    );
    await expectTenantDataEventually(
      expect(barPostQueryBuilder.getMany()),
      this.categories,
      1,
      barTenant,
    );

    const fooCategoryFindProm = fooPostQueryBuilder.getMany();
    const barCategoryFindProm = barPostQueryBuilder.getMany();
    const categoryFindProm = postQueryBuilder.getMany();

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

  it('should apply RLS to self joined relations', async () => {
    const fooPostQueryBuilder = this.fooConnection
      .createQueryBuilder(Post, 'posts')
      .leftJoinAndSelect('posts.categories', 'categories');
    const barPostQueryBuilder = this.barConnection
      .createQueryBuilder(Post, 'posts')
      .leftJoinAndSelect('posts.categories', 'categories');
    const postQueryBuilder = this.migrationDataSource
      .createQueryBuilder(Post, 'posts')
      .leftJoinAndSelect('posts.categories', 'categories');

    await expectPostDataRelation(
      expect(fooPostQueryBuilder.getMany()),
      this.posts,
      1,
      fooTenant,
    );
    await expectPostDataRelation(
      expect(barPostQueryBuilder.getMany()),
      this.posts,
      1,
      barTenant,
    );

    const fooPostFindProm = fooPostQueryBuilder.getMany();
    const barPostFindProm = barPostQueryBuilder.getMany();
    const postFindProm = postQueryBuilder.getMany();

    // execute them in parallel, the results should still be correct
    await Promise.all([fooPostFindProm, barPostFindProm, postFindProm]).then(
      async ([foo, bar, post]) => {
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
        expect(post).to.have.lengthOf(3).and.to.deep.equal(this.posts);
      },
    );
  });

  describe('queued queries', () => {
    let queryPrototypeSpy: Sinon.SinonSpy;
    let connectedQueryRunnersStub: Sinon.SinonStub;

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
      const fooPostQueryBuilder = this.fooConnection.createQueryBuilder(
        Category,
        'categories',
      );
      const barPostQueryBuilder = this.barConnection.createQueryBuilder(
        Category,
        'categories',
      );

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
          promises.push(fooPostQueryBuilder.getMany());
        } else {
          promises.push(barPostQueryBuilder.getMany());
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
});
