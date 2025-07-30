import { expect } from 'chai';
import { CustomSuite, DataSourceHarness } from 'test/util/harness';
import { Driver } from 'typeorm';
import {
  RLSConnection,
  RLSPostgresDriver,
  RLSPostgresQueryRunner,
} from '../../lib/common';
import { TenancyModelOptions } from '../interfaces';
import { resetDatabases } from '../util/test-utils';

describe('RLSPostgresDriver', function (this: CustomSuite) {
  const dataSourceHarness = new DataSourceHarness();

  let driver: RLSPostgresDriver;
  let originalDriver: Driver;

  const fooTenantModelOptions: TenancyModelOptions = {
    actorId: 10,
    tenantId: 1,
  };

  const barTenantModelOptions: TenancyModelOptions = {
    actorId: 20,
    tenantId: 2,
  };

  dataSourceHarness.setupHooks(fooTenantModelOptions, barTenantModelOptions);

  before(async () => {
    originalDriver = this.migrationDataSource.driver;
    driver = this.fooConnection.driver;
  });

  beforeEach(() => resetDatabases([this.migrationDataSource]));

  it('should be instance of RLSPostgresDriver', () => {
    expect(driver).to.be.instanceOf(RLSPostgresDriver);
  });

  it('should not be singleton instance', () => {
    expect(driver).to.not.equal(
      new RLSPostgresDriver(this.fooConnection, fooTenantModelOptions),
    );
  });

  it('should have the tenant and actor set', () => {
    expect(driver).to.have.property('actorId').and.to.be.equal(10);
    expect(driver).to.have.property('tenantId').and.to.be.equal(1);
  });

  it('should use the RLSConnection', () => {
    expect(driver)
      .to.have.property('connection')
      .and.deep.equal(this.fooConnection);
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
        .and.be.equal(fooTenantModelOptions.tenantId);
      expect(qr)
        .to.have.property('actorId')
        .and.be.equal(fooTenantModelOptions.actorId);
    });
  });
});
