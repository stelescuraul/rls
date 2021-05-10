import {
  closeTestingConnections,
  reloadTestingDatabases,
  setupSingleTestingConnection,
} from '../util/test-utils';
import { Connection, createConnection } from 'typeorm';
import {
  RLSConnection,
  RLSPostgresDriver,
  RLSPostgresQueryRunner,
} from '../../lib/common';
import { TenancyModelOptions } from '../interfaces';
import { expect } from 'chai';
import * as sinon from 'sinon';
import { PostgresQueryRunner } from 'typeorm/driver/postgres/PostgresQueryRunner';

describe('RLSPostgresQueryRunner', () => {
  let connection: RLSConnection;
  let originalConnection: Connection;
  let driver: RLSPostgresDriver;

  let queryRunner: RLSPostgresQueryRunner;

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
    connection = new RLSConnection(originalConnection, tenantModelOptions);
    driver = connection.driver;
  });
  beforeEach(async () => {
    await reloadTestingDatabases([connection]);
    queryRunner = new RLSPostgresQueryRunner(
      driver,
      'master',
      tenantModelOptions,
    );
  });
  afterEach(async () => {
    await queryRunner.release();
  });
  after(async () => await closeTestingConnections([originalConnection]));

  it('should be instance of RLSPostgresQueryRunner', () => {
    expect(queryRunner).to.be.instanceOf(RLSPostgresQueryRunner);
    expect(connection.createQueryRunner()).to.be.instanceOf(
      RLSPostgresQueryRunner,
    );
    expect(driver.createQueryRunner('master')).to.be.instanceOf(
      RLSPostgresQueryRunner,
    );
  });

  it('should not be singleton instance', () => {
    expect(queryRunner).to.not.equal(
      new RLSPostgresQueryRunner(driver, 'master', tenantModelOptions),
    );
    expect(queryRunner).to.not.equal(connection.createQueryRunner());
    expect(queryRunner).to.not.equal(driver.createQueryRunner('master'));
  });

  it('should have the tenant and actor set', () => {
    expect(queryRunner).to.have.property('actorId').and.to.be.equal(10);
    expect(queryRunner).to.have.property('tenantId').and.to.be.equal(1);
  });

  it('should use the RLSConnection', () => {
    expect(queryRunner)
      .to.have.property('connection')
      .and.deep.equal(connection);
    expect(queryRunner)
      .to.have.property('connection')
      .and.be.instanceOf(RLSConnection);
  });

  describe('#query', () => {
    describe('$RLSPostgresQueryRunner', () => {
      runQueryTests(
        tenantModelOptions,
        () => new RLSPostgresQueryRunner(driver, 'master', tenantModelOptions),
      );
    });

    describe('$RLSPostgresDriver', () => {
      runQueryTests(tenantModelOptions, () =>
        driver.createQueryRunner('master'),
      );
    });

    describe('$RLSConnection', () => {
      runQueryTests(tenantModelOptions, () => connection.createQueryRunner());
    });
  });
});

function runQueryTests(
  tenantModelOptions: TenancyModelOptions,
  createQueryRunner: () => RLSPostgresQueryRunner,
) {
  let queryRunner: RLSPostgresQueryRunner;
  let querySpy: sinon.SinonSpy;
  let queryPrototypeSpy: sinon.SinonSpy;

  beforeEach(() => {
    queryRunner = createQueryRunner();
    querySpy = sinon.spy(queryRunner, 'query');
    queryPrototypeSpy = sinon.spy(PostgresQueryRunner.prototype, 'query');
  });

  afterEach(async () => {
    await queryRunner.release();
    sinon.restore();
  });

  it('gets called 3 times on normal execution', async () => {
    await queryRunner.query('');
    expect(queryPrototypeSpy.callCount).to.be.equal(3);
    expect(querySpy.callCount).to.be.equal(1);
  });

  it('gets called with right query and no params', async () => {
    await queryRunner.query(`select 'foo'`);

    expect(queryPrototypeSpy.getCall(2)).to.have.been.calledWith(
      `select 'foo'`,
    );
  });

  it('gets called with right query and params', async () => {
    await queryRunner.query(`select $1`, ['foo']);

    expect(queryPrototypeSpy.getCall(2)).to.have.been.calledWith('select $1', [
      'foo',
    ]);
  });

  it('gets called with right tenantId', async () => {
    await queryRunner.query(`select 'foo'`);

    expect(queryPrototypeSpy.getCall(0)).to.have.been.calledWith(
      `select set_config('settings.tenant_id', '${tenantModelOptions.tenantId}', false)`,
    );
  });

  it('gets called with right actorId', async () => {
    await queryRunner.query(`select 'foo'`);

    expect(queryPrototypeSpy.getCall(1)).to.have.been.calledWith(
      `select set_config('settings.actor_id', '${tenantModelOptions.actorId}', false)`,
    );
  });

  it('does not add ghost query runners to the driver', () => {
    expect(queryRunner.driver.connectedQueryRunners).to.have.lengthOf(0);
  });
}
