import {
  closeConnections,
  resetDatabases,
  getConnectionOptions,
} from '../util/test-utils';
import { Connection, createConnection, Driver } from 'typeorm';
import {
  RLSConnection,
  RLSPostgresDriver,
  RLSPostgresQueryRunner,
} from '../../lib/common';
import { TenancyModelOptions } from '../interfaces';
import { expect } from 'chai';

describe('RLSPostgresDriver', () => {
  let driver: RLSPostgresDriver;
  let originalDriver: Driver;

  let connection: RLSConnection;
  let originalConnection: Connection;

  const tenantModelOptions: TenancyModelOptions = {
    actorId: 10,
    tenantId: 1,
  };

  before(async () => {
    const connectionOptions = await getConnectionOptions('postgres', {
      entities: [__dirname + '/entity/*{.js,.ts}'],
      dropSchema: true,
      schemaCreate: true,
    });

    originalConnection = await createConnection(connectionOptions);
    originalDriver = originalConnection.driver;
    connection = new RLSConnection(originalConnection, tenantModelOptions);
    driver = connection.driver;
  });
  beforeEach(() => resetDatabases([connection]));
  after(async () => await closeConnections([originalConnection]));

  it('should be instance of RLSPostgresDriver', () => {
    expect(driver).to.be.instanceOf(RLSPostgresDriver);
  });

  it('should not be singleton instance', () => {
    expect(driver).to.not.equal(
      new RLSPostgresDriver(connection, tenantModelOptions),
    );
  });

  it('should have the tenant and actor set', () => {
    expect(driver).to.have.property('actorId').and.to.be.equal(10);
    expect(driver).to.have.property('tenantId').and.to.be.equal(1);
  });

  it('should use the RLSConnection', () => {
    expect(driver).to.have.property('connection').and.deep.equal(connection);
    expect(driver)
      .to.have.property('connection')
      .and.be.instanceOf(RLSConnection);
  });

  it('should not be the same original driver', () => {
    expect(driver).to.not.deep.equal(originalDriver);
  });

  describe('#createQueryRunner', () => {
    it('should return an instance of RLSPostgresQueryRunner', () => {
      expect(driver.createQueryRunner('master')).to.not.throw;

      const qr = driver.createQueryRunner('master');
      expect(qr).to.be.instanceOf(RLSPostgresQueryRunner);
    });

    it('should have the right tenant and actor', () => {
      const qr = driver.createQueryRunner('master');

      expect(qr)
        .to.have.property('tenantId')
        .and.be.equal(tenantModelOptions.tenantId);
      expect(qr)
        .to.have.property('actorId')
        .and.be.equal(tenantModelOptions.actorId);
    });
  });
});
