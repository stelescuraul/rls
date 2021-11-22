import { expect } from 'chai';
import { Connection, createConnection } from 'typeorm';
import { PostgresDriver } from 'typeorm/driver/postgres/PostgresDriver';
import { RLSConnection, RLSPostgresQueryRunner } from '../../lib/common';
import { TenancyModelOptions } from 'lib/interfaces';
import {
  closeTestingConnections,
  reloadTestingDatabases,
  setupSingleTestingConnection,
} from '../util/test-utils';
import { Post } from '../util/entity/Post';
import { Category } from 'test/util/entity/Category';

describe('RLSConnection', () => {
  let connection: RLSConnection;
  let originalConnection: Connection;

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

    originalConnection = await createConnection(connectionOptions);
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

    const loadedPost = await postRepo.findOne(post.id);

    loadedPost.should.be.instanceOf(Post);
    loadedPost.id.should.be.eql(post.id);
    loadedPost.title.should.be.eql('Foo');
  });

  describe('#close', () => {
    it('throw error if trying to close connection on RLSConnection instance', async () => {
      const tempConnection = new RLSConnection(
        originalConnection,
        tenantModelOptions,
      );
      expect(tempConnection.close).to.throw(/Cannot close connection .*/);
      expect(tempConnection.isConnected).to.be.true;
      expect(originalConnection.isConnected).to.be.true;
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

      return expect(postRepo.findOne(postId)).to.eventually.have.property(
        'id',
        postId,
      );
    });
  });
});
