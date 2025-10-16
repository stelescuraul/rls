import { expect } from 'chai';
import * as Sinon from 'sinon';
import { User } from 'test/util/entity/User';
import { CustomSuite } from 'test/util/harness';
import { TestBootstrapHarness } from 'test/util/harness/testBootstrap';
import { PostgresDriver } from 'typeorm/driver/postgres/PostgresDriver';
import { PostgresQueryRunner } from 'typeorm/driver/postgres/PostgresQueryRunner';
import { TenancyModelOptions } from '../interfaces';
import { Category } from '../util/entity/Category';
import { Post } from '../util/entity/Post';
import {
  expectPostDataRelation,
  expectPostForTenant,
  expectTenantData,
  expectTenantDataEventually,
} from '../util/helpers';

describe('Repository', function (this: CustomSuite) {
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

  it('should return different repositories', () => {
    const fooPostRepository = this.fooConnection.getRepository(Post);
    const barPostRepository = this.barConnection.getRepository(Post);
    const postRepository = this.migrationDataSource.getRepository(Post);

    expect(fooPostRepository).to.not.deep.equal(postRepository);
    expect(barPostRepository).to.not.deep.equal(postRepository);
    expect(fooPostRepository).to.not.deep.equal(barPostRepository);
  });

  it('should apply RLS to repository', async () => {
    const fooPostRepository = this.fooConnection.getRepository(Post);
    const barPostRepository = this.barConnection.getRepository(Post);
    const postRepository = this.migrationDataSource.getRepository(Post);

    await expectTenantDataEventually(
      expect(fooPostRepository.find()),
      this.posts,
      1,
      fooTenant,
    );
    await expectTenantDataEventually(
      expect(barPostRepository.find()),
      this.posts,
      1,
      barTenant,
    );

    await expect(postRepository.find()).to.eventually.have.lengthOf(3);
  });

  it('should use the right database users', async () => {
    const [{ current_user: fooConnectionUser }] =
      await this.fooConnection.query('SELECT current_user;');
    const [{ current_user: barConnectionUser }] =
      await this.barConnection.query('SELECT current_user;');
    const [{ current_user: migrationConnectionUser }] =
      await this.migrationDataSource.query('SELECT current_user;');

    expect(fooConnectionUser).to.be.equal(this.tenantDbUser);
    expect(barConnectionUser).to.be.equal(this.tenantDbUser);
    expect(migrationConnectionUser).to.be.equal('postgres');
  });

  it('should apply RLS to multiple parallel repositories', async () => {
    const fooCategoryRepository = this.fooConnection.getRepository(Category);
    const barCategoryRepository = this.barConnection.getRepository(Category);
    const categoryRepository = this.migrationDataSource.getRepository(Category);

    await expectTenantDataEventually(
      expect(fooCategoryRepository.find()),
      this.categories,
      1,
      fooTenant,
    );
    await expectTenantDataEventually(
      expect(barCategoryRepository.find()),
      this.categories,
      1,
      barTenant,
    );

    const fooCategoryFindProm = fooCategoryRepository.find();
    const barCategoryFindProm = barCategoryRepository.find();
    const categoryFindProm = categoryRepository.find();

    const categories = this.categories;

    // execute them in parallel, the results should still be correct
    await Promise.all([
      fooCategoryFindProm,
      barCategoryFindProm,
      categoryFindProm,
    ]).then(async ([foo, bar, cat]) => {
      expectTenantData(expect(foo), categories, 1, fooTenant);
      expectTenantData(expect(bar), categories, 1, barTenant);
      expect(cat).to.have.lengthOf(2).and.to.deep.equal(categories);
    });
  });

  it('should apply RLS to join relation strategy', async () => {
    const fooPostRepository = this.fooConnection.getRepository(Post);
    const barPostRepository = this.barConnection.getRepository(Post);
    const postRepository = this.migrationDataSource.getRepository(Post);

    await expectPostDataRelation(
      expect(
        fooPostRepository.find({
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
        barPostRepository.find({
          relations: {
            categories: true,
          },
        }),
      ),
      this.posts,
      1,
      barTenant,
    );

    const fooPostFindProm = fooPostRepository.find({
      relations: {
        categories: true,
      },
    });
    const barPostFindProm = barPostRepository.find({
      relations: {
        categories: true,
      },
    });
    const postFindProm = postRepository.find({
      relations: {
        categories: true,
      },
    });

    const posts = this.posts;

    // execute them in parallel, the results should still be correct
    await Promise.all([fooPostFindProm, barPostFindProm, postFindProm]).then(
      async ([foo, bar, cat]) => {
        await expectPostDataRelation(expect(foo), posts, 1, fooTenant, false);
        await expectPostDataRelation(expect(bar), posts, 1, barTenant, false);
        expect(cat)
          .to.have.lengthOf(3)
          .satisfy((arr: Post[]) => arr.every(a => !!a.categories))
          .and.to.deep.equal(posts);
      },
    );
  });

  it('should apply RLS to query relation strategy', async () => {
    const fooPostRepository = this.fooConnection.getRepository(Post);
    const barPostRepository = this.barConnection.getRepository(Post);
    const postRepository = this.migrationDataSource.getRepository(Post);

    await expectPostDataRelation(
      expect(
        fooPostRepository.find({
          relationLoadStrategy: 'query',
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
        barPostRepository.find({
          relationLoadStrategy: 'query',
          relations: {
            categories: true,
          },
        }),
      ),
      this.posts,
      1,
      barTenant,
    );

    const fooPostFindProm = fooPostRepository.find({
      relationLoadStrategy: 'query',
      relations: {
        categories: true,
      },
    });
    const barPostFindProm = barPostRepository.find({
      relationLoadStrategy: 'query',
      relations: {
        categories: true,
      },
    });
    const postFindProm = postRepository.find({
      relationLoadStrategy: 'query',
      relations: {
        categories: true,
      },
    });

    const posts = this.posts;
    // execute them in parallel, the results should still be correct
    await Promise.all([fooPostFindProm, barPostFindProm, postFindProm]).then(
      async ([foo, bar, cat]) => {
        await expectPostDataRelation(expect(foo), posts, 1, fooTenant, false);
        await expectPostDataRelation(expect(bar), posts, 1, barTenant, false);
        expect(cat)
          .to.have.lengthOf(3)
          .satisfy((arr: Post[]) => arr.every(a => !!a.categories))
          .and.to.deep.equal(posts);
      },
    );
  });

  it('should apply RLS to all find operators', async () => {
    // use two repositories to also test the parallel execution for rls
    const fooPostRepository = this.fooConnection.getRepository(Post);
    const barPostRepository = this.barConnection.getRepository(Post);

    const fooFindByPromise = fooPostRepository.findBy({
      title: 'Foo post',
    });
    const barFindPromise = barPostRepository.find({
      where: {
        title: 'Bar post',
      },
    });
    const fooFindOnePromise = fooPostRepository.findOne({
      where: {
        title: 'Foo post',
      },
    });
    const barFindOneByPromise = barPostRepository.findOneBy({
      title: 'Bar post',
    });

    const posts = this.posts;

    await Promise.all([
      fooFindByPromise,
      barFindPromise,
      fooFindOnePromise,
      barFindOneByPromise,
    ]).then(
      async ([
        fooFindByResult,
        barFindResult,
        fooFindOneResult,
        barFindOneByResult,
      ]) => {
        await expectPostDataRelation(
          expect(fooFindByResult),
          posts,
          1,
          fooTenant,
          false,
        );
        await expectPostDataRelation(
          expect(barFindResult),
          posts,
          1,
          barTenant,
          false,
        );

        expect(fooFindOneResult).to.deep.equal(
          posts.find(
            x =>
              x.tenantId === fooTenant.tenantId &&
              x.userId === fooTenant.actorId &&
              x.categories.filter(c => c.tenantId === fooTenant.tenantId),
          ),
        );

        expectPostForTenant(fooFindOneResult, posts, fooTenant);
        expectPostForTenant(barFindOneByResult, posts, barTenant);
      },
    );
  });

  it('should throw database error on first query and fulfill the second query', async () => {
    const fooCategoryRepository = this.fooConnection.getRepository(Category);

    await expect(
      fooCategoryRepository.save({
        name: 'Test',
        numberValue: '@@@@' as any,
      }),
    ).to.be.rejected;

    await expect(fooCategoryRepository.find()).to.be.fulfilled;
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
      const fooCategoryRepository = this.fooConnection.getRepository(Category);
      const barCategoryRepository = this.barConnection.getRepository(Category);

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
          promises.push(fooCategoryRepository.find());
        } else {
          promises.push(barCategoryRepository.find());
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

  describe('Cyclic dependency on insert and remove', () => {
    it('should insert a user entity', async () => {
      const originalUserRepo = this.migrationDataSource.getRepository(User);
      const rlsUserRepo = this.fooConnection.getRepository(User);

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
      const originalUserRepo = this.migrationDataSource.getRepository(User);
      const rlsUserRepo = this.fooConnection.getRepository(User);

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
