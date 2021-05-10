import {
  closeTestingConnections,
  reloadTestingDatabases,
  setupSingleTestingConnection,
} from '../util/test-utils';
import { Connection, createConnection, Driver } from 'typeorm';
import { RLSConnection, RLSPostgresDriver } from '../../lib/common';
import { TenancyModelOptions } from '../../lib/interfaces';
import { expect } from 'chai';

describe('RLSPostgresDriver', () => {
  let driver: Driver;
  let originalDriver: Driver;

  let connection: RLSConnection;
  let originalConnection: Connection;

  const tenantModelOptions: TenancyModelOptions = {
    actorId: 10,
    tenantId: 1,
  };

  before(async () => {
    const connectionOptions = await setupSingleTestingConnection('postgres', {
      entities: [__dirname + '/entity/*{.js,.ts}'],
      dropSchema: true,
      schemaCreate: true,
    });

    originalConnection = await createConnection(connectionOptions);
    originalDriver = originalConnection.driver;
    connection = new RLSConnection(originalConnection, tenantModelOptions);
    driver = connection.driver;
  });
  beforeEach(() => reloadTestingDatabases([connection]));
  after(async () => await closeTestingConnections([originalConnection]));

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
});
