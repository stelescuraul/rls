import * as seedRandom from 'seedrandom';
import { expect } from 'chai';
import { TenancyModelOptions } from 'lib/interfaces';
import { Category } from 'test/util/entity/Category';
import {
  DataSource,
  DataSourceOptions,
  EntityManager,
  QueryRunner,
} from 'typeorm';
import { PostgresDriver } from 'typeorm/driver/postgres/PostgresDriver';
import { RLSConnection, RLSPostgresQueryRunner } from '../../lib/common';
import { Post } from '../util/entity/Post';
import { Transform } from 'stream';
import {
  closeTestingConnections,
  getTypeOrmConfig,
  reloadTestingDatabases,
  setupSingleTestingConnection,
} from '../util/test-utils';
import {
  createTeantUser,
  resetMultiTenant,
  setupMultiTenant,
} from 'test/util/helpers';

const configs = getTypeOrmConfig();

describe('RLSConnection', () => {
  let connection: RLSConnection;
  let originalConnection: DataSource;

  const tenantModelOptions: TenancyModelOptions = {
    actorId: 10,
    tenantId: 1,
  };

  before(async () => {
    const connectionOptions = setupSingleTestingConnection('postgres', {
      entities: [Post, Category],
      dropSchema: true,
      schemaCreate: true,
    });

    originalConnection = await new DataSource(connectionOptions).initialize();
    connection = new RLSConnection(originalConnection, tenantModelOptions);
  });
  beforeEach(() => reloadTestingDatabases([connection]));
  after(() => closeTestingConnections([originalConnection]));

  it('should be instance of RLSConnection', () => {
    expect(connection).to.be.instanceOf(RLSConnection);
  });

  it('should not be singleton instance', () => {
    expect(connection).to.not.equal(
      new RLSConnection(originalConnection, tenantModelOptions),
    );
  });

  it('should have the tenant and actor set', () => {
    expect(connection).to.have.property('actorId').and.to.be.equal(10);
    expect(connection).to.have.property('tenantId').and.to.be.equal(1);
  });

  it('should not have the same manager', () => {
    // https://github.com/mochajs/mocha/issues/1624
    try {
      expect(connection.manager).to.not.deep.equal(originalConnection.manager);
    } catch (e) {
      e.showDiff = false;
      throw e;
    }
  });

  it('should not have the same driver', () => {
    // https://github.com/mochajs/mocha/issues/1624
    try {
      expect(connection.driver).to.not.deep.equal(originalConnection.driver);
    } catch (e) {
      e.showDiff = false;
      throw e;
    }
  });

  it('should have all the other properties and be unchanged', () => {
    const keys = [
      'name',
      'options',
      'isConnected',
      'isInitialized',
      'namingStrategy',
      'migrations',
      'subscribers',
      'queryResultCache',
      'relationLoader',
    ];
    for (const key of keys) {
      expect(connection).to.have.property(key, originalConnection[key]);
    }
    expect(connection).to.have.property('entityMetadatas');
    for (const entityMedata of connection.entityMetadatas) {
      expect(entityMedata).to.have.property('connection', connection);
    }
  });

  it('should save and return the Post', async () => {
    const postRepo = connection.getRepository(Post);
    const post = postRepo.create();
    post.title = 'Foo';
    post.tenantId = tenantModelOptions.tenantId as number;
    post.userId = tenantModelOptions.actorId as number;
    await postRepo.save(post);

    const loadedPost = await postRepo.findOneBy({ id: post.id });

    expect(loadedPost).to.be.instanceOf(Post);
    expect(loadedPost.id).to.eql(post.id);
    expect(loadedPost.title).to.eql('Foo');
  });

  it('should save and return the Post using streams', async () => {
    const postRepo = connection.getRepository(Post);
    const post = postRepo.create();
    post.title = 'Foo';
    post.tenantId = tenantModelOptions.tenantId as number;
    post.userId = tenantModelOptions.actorId as number;
    await postRepo.save(post);

    const postStream = await postRepo
      .createQueryBuilder('post')
      .where({ id: post.id })
      .stream();

    const loadedPosts = await new Promise<any>((resolve, reject) => {
      const result = [];
      postStream.on('data', data => result.push(data));
      postStream.on('end', () => resolve(result));
      postStream.on('error', reject);
    });

    expect(loadedPosts).to.have.lengthOf(1);
    expect(loadedPosts[0].post_id).to.eql(post.id);
    expect(loadedPosts[0].post_title).to.eql('Foo');
  });

  it('should save and return the Post using streams within a transaction', async () => {
    await connection.transaction(async entityManager => {
      const postRepo = entityManager.getRepository(Post);
      const post = postRepo.create();
      post.title = 'Foo';
      post.tenantId = tenantModelOptions.tenantId as number;
      post.userId = tenantModelOptions.actorId as number;
      await postRepo.save(post);

      const postStream = await postRepo
        .createQueryBuilder('post')
        .where({ id: post.id })
        .stream();

      const loadedPosts = await new Promise<any>((resolve, reject) => {
        const result = [];
        postStream.on('data', data => result.push(data));
        postStream.on('end', () => resolve(result));
        postStream.on('error', reject);
      });

      expect(loadedPosts).to.have.lengthOf(1);
      expect(loadedPosts[0].post_id).to.eql(post.id);
      expect(loadedPosts[0].post_title).to.eql('Foo');
    });
  });

  it('should not reset tenantid if a query is ran while streaming', async () => {
    const postRepo = connection.getRepository(Post);
    const fooPost = postRepo.create();
    fooPost.title = 'Foo';
    fooPost.tenantId = tenantModelOptions.tenantId as number;
    fooPost.userId = tenantModelOptions.actorId as number;

    const barPost = postRepo.create();
    barPost.title = 'Bar';
    barPost.tenantId = tenantModelOptions.tenantId as number;
    barPost.userId = tenantModelOptions.actorId as number;
    await postRepo.save([fooPost, barPost]);

    const loadedPosts = await new Promise<Post[]>(async (resolve, reject) => {
      const postStream = (
        await postRepo.createQueryBuilder('post').stream()
      ).pipe(
        new Transform({
          objectMode: true,
          transform: async (data, encoding, callback) => {
            try {
              callback(
                null,
                await postRepo.findOneOrFail({
                  where: { id: data.post_id },
                }),
              );
            } catch (err) {
              callback(err);
            }
          },
        }),
      );

      const result: Post[] = [];
      postStream.on('data', (data: Post) => {
        result.push(data);
      });
      postStream.on('end', () => resolve(result));
      postStream.on('error', reject);
    });

    expect(loadedPosts).to.have.lengthOf(2);
    expect(loadedPosts[0]).to.be.instanceOf(Post);
    expect(loadedPosts[0].id).to.eql(fooPost.id);
    expect(loadedPosts[0].title).to.eql('Foo');

    expect(loadedPosts[1]).to.be.instanceOf(Post);
    expect(loadedPosts[1].id).to.eql(barPost.id);
    expect(loadedPosts[1].title).to.eql('Bar');
  });

  describe('#close', () => {
    it('throw error if trying to close connection on RLSConnection instance', async () => {
      const tempConnection = new RLSConnection(
        originalConnection,
        tenantModelOptions,
      );
      expect(tempConnection.close).to.throw(
        /Cannot close virtual connection.*/,
      );
      expect(tempConnection.isInitialized).to.be.true;
      expect(originalConnection.isInitialized).to.be.true;
      expect((originalConnection.driver as PostgresDriver).master.ending).to.be
        .false;
    });
  });

  describe('#destroy', () => {
    it('throw error if trying to destroy connection on RLSConnection instance', async () => {
      const tempConnection = new RLSConnection(
        originalConnection,
        tenantModelOptions,
      );
      expect(tempConnection.destroy).to.throw(
        /Cannot destroy virtual connection.*/,
      );
      expect(tempConnection.isInitialized).to.be.true;
      expect(originalConnection.isInitialized).to.be.true;
      expect((originalConnection.driver as PostgresDriver).master.ending).to.be
        .false;
    });
  });

  describe('#createQueryRunner', () => {
    it('should return an instance of RLSPostgresQueryRunner', () => {
      expect(connection.createQueryRunner()).to.not.throw;

      const qr = connection.createQueryRunner();
      expect(qr).to.be.instanceOf(RLSPostgresQueryRunner);
    });

    it('should have the right tenant and actor', () => {
      const qr = connection.createQueryRunner();

      expect(qr)
        .to.have.property('tenantId')
        .and.be.equal(tenantModelOptions.tenantId);
      expect(qr)
        .to.have.property('actorId')
        .and.be.equal(tenantModelOptions.actorId);
    });

    it('should rollback the entity deletion', async () => {
      const postRepo = connection.getRepository(Post);
      const post = postRepo.create();
      post.title = 'Foo';
      post.tenantId = tenantModelOptions.tenantId as number;
      post.userId = tenantModelOptions.actorId as number;
      await postRepo.save(post);

      const postId = post.id;

      const qr = connection.createQueryRunner();
      const manager = qr.manager;
      await qr.startTransaction();
      await manager.remove(post);
      await qr.rollbackTransaction();
      await qr.release();

      return expect(
        postRepo.findOne({ where: { id: postId } }),
      ).to.eventually.have.property('id', postId);
    });
  });

  describe('with multiple queries on a single connection (issues/224)', () => {
    let singlePoolConnection: DataSource;
    const tenantDbUser = 'tenant_aware_user';
    const rng = seedRandom('test-single-connection-issue-224');

    before(async () => {
      await createTeantUser(originalConnection, tenantDbUser);

      const connectionOptions = setupSingleTestingConnection(
        'postgres',
        {
          entities: [Post, Category],
        },
        {
          ...configs[0],
          name: 'singlePoolConnection',
          username: tenantDbUser,
          extra: {
            poolSize: 1, // Force single connection to test RLS
          },
        } as DataSourceOptions,
      );

      singlePoolConnection = await new DataSource(
        connectionOptions,
      ).initialize();
    });

    beforeEach(async () => {
      await reloadTestingDatabases([originalConnection]);
      await setupMultiTenant(originalConnection, tenantDbUser);
    });

    after(async () => {
      await resetMultiTenant(originalConnection, tenantDbUser);
      await closeTestingConnections([singlePoolConnection]);
    });

    async function runInTransaction<T>(
      connection: DataSource,
      runInTransaction: (
        entityManager: EntityManager,
        qr: QueryRunner,
      ) => Promise<T>,
    ) {
      const qr = connection.createQueryRunner();
      const manager = qr.manager;
      try {
        await qr.startTransaction();
        const result = await runInTransaction(manager, qr);
        if (qr.isTransactionActive) {
          await qr.commitTransaction();
        }
        return result;
      } catch (error) {
        if (qr.isTransactionActive) {
          await qr.rollbackTransaction();
        }
        throw error;
      } finally {
        await qr.release();
      }
    }

    async function fetchPostWithRandomDelay(em: EntityManager) {
      // Add a seeded delay between 100ms and 2000ms
      const delay = Math.floor(rng() * 1900) + 100;
      await new Promise(resolve => setTimeout(resolve, delay));

      return em.find(Post);
    }

    it('should handle multiple queries in a transaction for the same tenant', async () => {
      const tenant: TenancyModelOptions = {
        actorId: 1,
        tenantId: 100,
      };

      const fooConnection = new RLSConnection(singlePoolConnection, tenant);
      const postRepo = fooConnection.getRepository(Post);

      await postRepo.save({ title: 'Test Post', tenantId: 100, userId: 1 });

      await runInTransaction(fooConnection, async em => {
        const promises = [];
        const iterations = 100;
        for (let i = 0; i < iterations; i++) {
          promises.push(fetchPostWithRandomDelay(em));
        }

        const results = (await Promise.all(promises)).flat();
        expect(results).to.have.lengthOf(iterations);

        for (const result of results) {
          expect(result).to.have.property('tenantId', 100);
        }
      });
    });

    it('should handle multiple queries in a transaction for different tenants', async () => {
      const fooTenant: TenancyModelOptions = {
        actorId: 1,
        tenantId: 100,
      };
      const barTenant: TenancyModelOptions = {
        actorId: 2,
        tenantId: 200,
      };

      const fooConnection = new RLSConnection(singlePoolConnection, fooTenant);
      const barConnection = new RLSConnection(singlePoolConnection, barTenant);

      const fooPostRepo = fooConnection.getRepository(Post);
      const barPostRepo = barConnection.getRepository(Post);

      await fooPostRepo.save({ title: 'Foo Post', tenantId: 100, userId: 1 });
      await barPostRepo.save({ title: 'Bar Post', tenantId: 200, userId: 2 });

      const fooTransaction = runInTransaction(fooConnection, async em => {
        const promises = [];
        const iterations = 1000;
        for (let i = 0; i < iterations; i++) {
          promises.push(fetchPostWithRandomDelay(em));
        }
        return Promise.all(promises);
      });

      const barTransaction = runInTransaction(barConnection, async em => {
        const promises = [];
        const iterations = 1000;
        for (let i = 0; i < iterations; i++) {
          promises.push(fetchPostWithRandomDelay(em));
        }
        return Promise.all(promises);
      });

      const results = await Promise.all([fooTransaction, barTransaction]);

      const fooResults = results[0].flat();
      const barResults = results[1].flat();

      expect(fooResults).to.have.lengthOf(1000);
      expect(barResults).to.have.lengthOf(1000);
      for (const result of fooResults) {
        expect(result).to.have.property('tenantId', 100);
      }
      for (const result of barResults) {
        expect(result).to.have.property('tenantId', 200);
      }
    });

    it('should handle multiple queries for different tenants without transaction', async () => {
      const fooTenant: TenancyModelOptions = {
        actorId: 1,
        tenantId: 100,
      };
      const barTenant: TenancyModelOptions = {
        actorId: 2,
        tenantId: 200,
      };

      const fooConnection = new RLSConnection(singlePoolConnection, fooTenant);
      const barConnection = new RLSConnection(singlePoolConnection, barTenant);

      const fooPostRepo = fooConnection.getRepository(Post);
      const barPostRepo = barConnection.getRepository(Post);

      await fooPostRepo.save({ title: 'Foo Post', tenantId: 100, userId: 1 });
      await barPostRepo.save({ title: 'Bar Post', tenantId: 200, userId: 2 });

      const fooPromises = [];
      const barPromises = [];
      const iterations = 1000;
      for (let i = 0; i < iterations; i++) {
        fooPromises.push(fooPostRepo.find());
        barPromises.push(barPostRepo.find());
      }

      const results = (
        await Promise.all([...fooPromises, ...barPromises])
      ).flat();
      expect(results).to.have.lengthOf(iterations * 2);

      const fooResults = results.slice(0, iterations);
      const barResults = results.slice(iterations);

      for (const result of fooResults) {
        expect(result).to.have.property('tenantId', 100);
      }
      for (const result of barResults) {
        expect(result).to.have.property('tenantId', 200);
      }
    });
  });
});
