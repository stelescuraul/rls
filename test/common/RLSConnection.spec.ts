import { expect } from 'chai';
import { TenancyModelOptions } from 'lib/interfaces';
import { Category } from 'test/util/entity/Category';
import { DataSource } from 'typeorm';
import { PostgresDriver } from 'typeorm/driver/postgres/PostgresDriver';
import { RLSConnection, RLSPostgresQueryRunner } from '../../lib/common';
import { Post } from '../util/entity/Post';
import { Transform } from 'stream';
import {
  closeTestingConnections,
  reloadTestingDatabases,
  setupSingleTestingConnection,
} from '../util/test-utils';

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

    loadedPost.should.be.instanceOf(Post);
    loadedPost.id.should.be.eql(post.id);
    loadedPost.title.should.be.eql('Foo');
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

    loadedPosts.should.have.lengthOf(1);
    loadedPosts[0].post_id.should.be.eql(post.id);
    loadedPosts[0].post_title.should.be.eql('Foo');
  });

  it('should save and return the Post using streams within a transaction', async () => {
    connection.transaction(async entityManager => {
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

      loadedPosts.should.have.lengthOf(1);
      loadedPosts[0].post_id.should.be.eql(post.id);
      loadedPosts[0].post_title.should.be.eql('Foo');
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

    loadedPosts.should.have.lengthOf(2);
    loadedPosts[0].should.be.instanceOf(Post);
    loadedPosts[0].id.should.be.eql(fooPost.id);
    loadedPosts[0].title.should.be.eql('Foo');

    loadedPosts[1].should.be.instanceOf(Post);
    loadedPosts[1].id.should.be.eql(barPost.id);
    loadedPosts[1].title.should.be.eql('Bar');
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
});
