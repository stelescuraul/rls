import { expect } from 'chai';
import * as Sinon from 'sinon';
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
  closeConnections,
  getTypeOrmConfig,
  resetDatabases,
  getConnectionOptions,
} from '../util/test-utils';
import { Category } from '../util/entity/Category';
import { Post } from '../util/entity/Post';
const config = getTypeOrmConfig();

describe('QueryBuilder', function () {
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
    const migrationConnectionOptions = getConnectionOptions('postgres', {
      entities: [Post, Category],
      dropSchema: true,
      schemaCreate: true,
    });
    const tenantAwareConnectionOptions = getConnectionOptions(
      'postgres',
      {
        entities: [Post, Category],
      },
      {
        ...config,
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
    await resetDatabases([migrationConnection]);
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
    await closeConnections([migrationConnection, tenantUserConnection]);
  });

  it('should return different queryBuilders', () => {
    const fooQueryBuilder = fooConnection.createQueryBuilder(Post, 'post');
    const barQueryBuilder = barConnection.createQueryBuilder(Post, 'post');
    const queryBuilder = migrationConnection.createQueryBuilder(Post, 'post');

    expect(fooQueryBuilder).to.not.deep.equal(queryBuilder);
    expect(barQueryBuilder).to.not.deep.equal(queryBuilder);
    expect(fooQueryBuilder).to.not.deep.equal(barQueryBuilder);
  });

  it('should apply RLS to queryBuilder', async () => {
    const fooPostQueryBuilder = fooConnection
      .createQueryBuilder(Post, 'post')
      .leftJoinAndSelect('post.categories', 'category');
    const barPostQueryBuilder = barConnection
      .createQueryBuilder(Post, 'post')
      .leftJoinAndSelect('post.categories', 'category');
    const postQueryBuilder = migrationConnection
      .createQueryBuilder(Post, 'post')
      .leftJoinAndSelect('post.categories', 'category');

    await expectTenantDataEventually(
      expect(fooPostQueryBuilder.getMany()),
      posts,
      1,
      fooTenant,
    );
    await expectTenantDataEventually(
      expect(barPostQueryBuilder.getMany()),
      posts,
      1,
      barTenant,
    );
    await expect(postQueryBuilder.getMany()).to.eventually.have.lengthOf(3);
  });

  it('should apply RLS to multiple parallel queryBuilders', async () => {
    const fooPostQueryBuilder = fooConnection.createQueryBuilder(
      Category,
      'categories',
    );
    const barPostQueryBuilder = barConnection.createQueryBuilder(
      Category,
      'categories',
    );
    const postQueryBuilder = migrationConnection.createQueryBuilder(
      Category,
      'categories',
    );

    await expectTenantDataEventually(
      expect(fooPostQueryBuilder.getMany()),
      categories,
      1,
      fooTenant,
    );
    await expectTenantDataEventually(
      expect(barPostQueryBuilder.getMany()),
      categories,
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
      await expectTenantData(expect(foo), categories, 1, fooTenant);
      await expectTenantData(expect(bar), categories, 1, barTenant);
      await expect(cat).to.have.lengthOf(2).and.to.deep.equal(categories);
    });
  });

  it('should apply RLS to self joined relations', async () => {
    const fooPostQueryBuilder = fooConnection
      .createQueryBuilder(Post, 'posts')
      .leftJoinAndSelect('posts.categories', 'categories');
    const barPostQueryBuilder = barConnection
      .createQueryBuilder(Post, 'posts')
      .leftJoinAndSelect('posts.categories', 'categories');
    const postQueryBuilder = migrationConnection
      .createQueryBuilder(Post, 'posts')
      .leftJoinAndSelect('posts.categories', 'categories');

    await expectPostDataRelation(
      expect(fooPostQueryBuilder.getMany()),
      posts,
      1,
      fooTenant,
    );
    await expectPostDataRelation(
      expect(barPostQueryBuilder.getMany()),
      posts,
      1,
      barTenant,
    );

    const fooPostFindProm = fooPostQueryBuilder.getMany();
    const barPostFindProm = barPostQueryBuilder.getMany();
    const postFindProm = postQueryBuilder.getMany();

    // execute them in parallel, the results should still be correct
    await Promise.all([fooPostFindProm, barPostFindProm, postFindProm]).then(
      async ([foo, bar, post]) => {
        await expectPostDataRelation(expect(foo), posts, 1, fooTenant, false);
        await expectPostDataRelation(expect(bar), posts, 1, barTenant, false);
        await expect(post).to.have.lengthOf(3).and.to.deep.equal(posts);
      },
    );
  });

  describe('queued queries', () => {
    let queryPrototypeSpy: Sinon.SinonSpy;
    let connectedQueryRunnersStub: Sinon.SinonStub;

    beforeEach(() => {
      queryPrototypeSpy = Sinon.spy(PostgresQueryRunner.prototype, 'query');

      connectedQueryRunnersStub = Sinon.stub(
        (tenantUserConnection.driver as PostgresDriver).connectedQueryRunners,
        'push',
      ).callThrough();
    });
    afterEach(() => {
      Sinon.restore();
    });

    it('should apply RLS to queued queries', async () => {
      const fooPostQueryBuilder = fooConnection.createQueryBuilder(
        Category,
        'categories',
      );
      const barPostQueryBuilder = barConnection.createQueryBuilder(
        Category,
        'categories',
      );

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
          promises.push(fooPostQueryBuilder.getMany());
        } else {
          promises.push(barPostQueryBuilder.getMany());
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
});
