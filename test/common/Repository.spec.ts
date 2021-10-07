import { expect } from 'chai';
import sinon = require('sinon');
import { Connection, ConnectionOptions, createConnection } from 'typeorm';
import { PostgresDriver } from 'typeorm/driver/postgres/PostgresDriver';
import { PostgresQueryRunner } from 'typeorm/driver/postgres/PostgresQueryRunner';
import { RLSConnection } from '../../lib/common';
import { TenancyModelOptions } from '../interfaces';
import {
  createData,
  createTeantUser,
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
import { User } from 'test/util/entity/User';

const configs = getTypeOrmConfig();

describe('Repository', function () {
  const tenantDbUser = 'tenant_aware_user';
  let fooConnection: RLSConnection;
  let barConnection: RLSConnection;
  let migrationConnection: Connection;
  let tenantUserConnection: Connection;
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
    const migrationConnectionOptions = setupSingleTestingConnection(
      'postgres',
      {
        entities: [Post, Category, User],
        dropSchema: true,
        schemaCreate: true,
      },
    );
    const tenantAwareConnectionOptions = setupSingleTestingConnection(
      'postgres',
      {
        entities: [Post, Category, User],
      },
      {
        ...configs[0],
        name: 'tenantAware',
        username: tenantDbUser,
      } as ConnectionOptions,
    );

    migrationConnection = await createConnection(migrationConnectionOptions);
    await createTeantUser(migrationConnection, tenantDbUser);

    tenantUserConnection = await createConnection(tenantAwareConnectionOptions);
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

  it('should return different repositories', () => {
    const fooPostRepository = fooConnection.getRepository(Post);
    const barPostRepository = barConnection.getRepository(Post);
    const postRepository = migrationConnection.getRepository(Post);

    expect(fooPostRepository).to.not.deep.equal(postRepository);
    expect(barPostRepository).to.not.deep.equal(postRepository);
    expect(fooPostRepository).to.not.deep.equal(barPostRepository);
  });

  it('should apply RLS to repository', async () => {
    const fooPostRepository = fooConnection.getRepository(Post);
    const barPostRepository = barConnection.getRepository(Post);
    const postRepository = migrationConnection.getRepository(Post);

    await expectTenantDataEventually(
      expect(fooPostRepository.find()),
      posts,
      1,
      fooTenant,
    );
    await expectTenantDataEventually(
      expect(barPostRepository.find()),
      posts,
      1,
      barTenant,
    );

    await expect(postRepository.find()).to.eventually.have.lengthOf(3);
  });

  it('should use the right database users', async () => {
    const [{ current_user: fooConnectionUser }] = await fooConnection.query(
      'SELECT current_user;',
    );
    const [{ current_user: barConnectionUser }] = await barConnection.query(
      'SELECT current_user;',
    );
    const [{ current_user: migrationConnectionUser }] =
      await migrationConnection.query('SELECT current_user;');

    expect(fooConnectionUser).to.be.equal(tenantDbUser);
    expect(barConnectionUser).to.be.equal(tenantDbUser);
    expect(migrationConnectionUser).to.be.equal('postgres');
  });

  it('should apply RLS to multiple parallel repositories', async () => {
    const fooCategoryRepository = fooConnection.getRepository(Category);
    const barCategoryRepository = barConnection.getRepository(Category);
    const categoryRepository = migrationConnection.getRepository(Category);

    await expectTenantDataEventually(
      expect(fooCategoryRepository.find()),
      categories,
      1,
      fooTenant,
    );
    await expectTenantDataEventually(
      expect(barCategoryRepository.find()),
      categories,
      1,
      barTenant,
    );

    const fooCategoryFindProm = fooCategoryRepository.find();
    const barCategoryFindProm = barCategoryRepository.find();
    const categoryFindProm = categoryRepository.find();

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

  it('should throw database error on first query and fulfill the second query', async () => {
    const fooCategoryRepository = fooConnection.getRepository(Category);

    await expect(
      fooCategoryRepository.save({
        name: 'Test',
        numberValue: '@@@@' as any,
      }),
    ).to.be.rejected;

    await expect(fooCategoryRepository.find()).to.be.fulfilled;
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
      const fooCategoryRepository = fooConnection.getRepository(Category);
      const barCategoryRepository = barConnection.getRepository(Category);

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
          promises.push(fooCategoryRepository.find());
        } else {
          promises.push(barCategoryRepository.find());
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

  describe('Cyclic dependency on insert and remove', () => {
    it('should insert a user entity', async () => {
      const originalUserRepo = migrationConnection.getRepository(User);
      const rlsUserRepo = fooConnection.getRepository(User);

      const originalRepoParentUser = originalUserRepo.create({
        tenantId: fooTenant.tenantId as number,
        userId: fooTenant.actorId as number,
        title: 'Original Parent',
      });
      const rlsRepoParentUser = rlsUserRepo.create({
        tenantId: fooTenant.tenantId as number,
        userId: fooTenant.actorId as number,
        title: 'RLS Parent',
      });

      expect(originalRepoParentUser).to.not.be.undefined;
      expect(rlsRepoParentUser).to.not.be.undefined;

      await expect(originalUserRepo.save(originalRepoParentUser)).to.be
        .fulfilled;

      // this used to fail because of inverseEntityMetadata
      await expect(rlsUserRepo.save(rlsRepoParentUser)).to.be.fulfilled;
    });

    it('should remove a user entity', async () => {
      const originalUserRepo = migrationConnection.getRepository(User);
      const rlsUserRepo = fooConnection.getRepository(User);

      const originalRepoParentUser = originalUserRepo.create({
        tenantId: fooTenant.tenantId as number,
        userId: fooTenant.actorId as number,
        title: 'Original Parent',
      });
      const rlsRepoParentUser = rlsUserRepo.create({
        tenantId: fooTenant.tenantId as number,
        userId: fooTenant.actorId as number,
        title: 'RLS Parent',
      });

      expect(originalRepoParentUser).to.not.be.undefined;
      expect(rlsRepoParentUser).to.not.be.undefined;

      await originalUserRepo.insert(originalRepoParentUser);
      await rlsUserRepo.insert(rlsRepoParentUser);

      await expect(originalUserRepo.remove(originalRepoParentUser)).to.be
        .fulfilled;
      await expect(rlsUserRepo.remove(rlsRepoParentUser)).to.be.fulfilled;
    });
  });
});
