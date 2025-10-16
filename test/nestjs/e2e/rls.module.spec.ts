import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { expect } from 'chai';
import { RLSConnection } from 'lib/common';
import { TenancyModelOptions } from 'lib/interfaces';
import * as Sinon from 'sinon';
import * as request from 'supertest';
import { AppModule } from 'test/nestjs/src/app.module';
import { AppService } from 'test/nestjs/src/app.service';
import { Category } from 'test/util/entity/Category';
import { CustomSuite } from 'test/util/harness';
import { TestBootstrapHarness } from 'test/util/harness/testBootstrap';
import { expectTenantData } from 'test/util/helpers';
import { DataSource } from 'typeorm';

describe('RLS Module', function (this: CustomSuite) {
  const testBootstrapHarness = new TestBootstrapHarness();

  let app: INestApplication;
  let moduleRef: TestingModule;

  const fooTenant: TenancyModelOptions = {
    actorId: 10,
    tenantId: 1,
  };

  const barTenant: TenancyModelOptions = {
    actorId: 20,
    tenantId: 2,
  };

  testBootstrapHarness.setupHooks(fooTenant, barTenant);

  before(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    await app.listen(0);
  });

  after(async () => {
    await app.close();
  });

  it(`GET /status`, () => {
    return request(app.getHttpServer()).get('/status').expect(200).expect('ok');
  });

  it('GET /categories and /posts for foo tenant', () => {
    getAuthRequest(app, 'get', '/posts', fooTenant)
      .expect(200)
      .expect(res => {
        expectTenantData(expect(res.body), this.posts, 1, fooTenant, true);
      });

    return getAuthRequest(app, 'get', '/categories', fooTenant)
      .expect(200)
      .expect(res => {
        expectTenantData(expect(res.body), this.categories, 1, fooTenant, true);
      });
  });

  it('GET /posts using stream for foo tenant', async () => {
    return getAuthRequest(app, 'get', '/posts?useStream=true', fooTenant)
      .expect(200)
      .expect(res => {
        expectTenantData(expect(res.body), this.posts, 1, fooTenant, true);
      });
  });

  it('GET /categories for bar tenant', () => {
    return getAuthRequest(app, 'get', '/categories', barTenant)
      .expect(200)
      .expect(res => {
        expectTenantData(expect(res.body), this.categories, 1, barTenant, true);
      });
  });

  it('GET /categories for both tenants', async () => {
    const fooReqProm = getAuthRequest(app, 'get', '/categories', fooTenant)
      .expect(200)
      .expect(res => {
        expectTenantData(expect(res.body), this.categories, 1, fooTenant, true);
      });
    const barReqProm = getAuthRequest(app, 'get', '/categories', barTenant)
      .expect(200)
      .expect(res => {
        expectTenantData(expect(res.body), this.categories, 1, barTenant, true);
      });

    await Promise.all([fooReqProm, barReqProm]);
  });

  it('GET /test connection ', async () => {
    const resp = await getAuthRequest(
      app,
      'get',
      '/simulate-entity-remove-rollback',
      fooTenant,
    );

    const deletedCategoryId = resp.body.categoryId;

    const fooReqProm = getAuthRequest(app, 'get', '/categories', fooTenant)
      .expect(200)
      .expect((res: { body: Category[] }) => {
        const allCategoryIds = res.body.map(cat => cat.id);
        expect(allCategoryIds).to.contain(deletedCategoryId);
      });

    return fooReqProm;
  });

  describe('multiple-requests', () => {
    let connectionStub: Sinon.SinonStub;
    let clock: Sinon.SinonFakeTimers;
    let stopStub: Sinon.SinonStub;

    // Start the server first
    beforeEach(() => {
      connectionStub = Sinon.stub(
        AppService.prototype,
        'getConnection',
      ).callThrough();

      stopStub = Sinon.stub(AppService.prototype, 'stop').callThrough();

      clock = Sinon.useFakeTimers({
        toFake: ['setTimeout'],
      });
    });

    afterEach(() => {
      Sinon.restore();
      clock.restore();
    });

    it('should use the right connection for request', async () => {
      expect(connectionStub.callCount).is.equal(0);
      await getAuthRequest(app, 'get', '/categories', barTenant).expect(200);

      expect(connectionStub).to.have.been.calledOnce;
      const usedConnection = await connectionStub.returnValues[0];
      expect(usedConnection).to.be.instanceOf(RLSConnection);
      expect(usedConnection)
        .to.have.property('actorId')
        .and.to.be.equal(barTenant.actorId.toString());
      expect(usedConnection)
        .to.have.property('tenantId')
        .and.to.be.equal(barTenant.tenantId.toString());
    });

    it('should use different connections for multiple-requests', async () => {
      expect(connectionStub.callCount).is.equal(0);
      await getAuthRequest(app, 'get', '/categories', fooTenant).expect(200);
      await getAuthRequest(app, 'get', '/categories', barTenant).expect(200);

      expect(connectionStub).to.have.been.calledTwice;

      const fooConnection = await connectionStub.returnValues[0];
      const barConnection = await connectionStub.returnValues[1];

      expect(fooConnection).to.not.deep.equal(barConnection);

      expect(fooConnection)
        .to.have.property('actorId')
        .and.to.be.equal(fooConnection.actorId.toString());
      expect(fooConnection)
        .to.have.property('tenantId')
        .and.to.be.equal(fooConnection.tenantId.toString());

      expect(barConnection)
        .to.have.property('actorId')
        .and.to.be.equal(barTenant.actorId.toString());
      expect(barConnection)
        .to.have.property('tenantId')
        .and.to.be.equal(barTenant.tenantId.toString());
    });

    /**
     * Make first request for foo tenant and simulate a wait
     *
     */
    it('should not have race conditions on multiple-requests', async () => {
      let pending = true;
      const fooResolver = Sinon.fake.resolves(
        new Promise(resolve => {
          return setTimeout(async () => {
            resolve(true);
          }, 3000);
        }),
      );

      stopStub.onCall(0).resolves(fooResolver());

      const host = `http://127.0.0.1:${app.getHttpServer().address().port}`;

      const fooReqProm = fetch(`${host}/categories`, {
        headers: {
          // eslint-disable-next-line @typescript-eslint/naming-convention
          tenant_id: fooTenant.tenantId as string,
          // eslint-disable-next-line @typescript-eslint/naming-convention
          actor_id: fooTenant.actorId as string,
        },
      });

      fooReqProm.finally(() => (pending = false));

      await getAuthRequest(app, 'get', '/categories', barTenant)
        .expect(200)
        .expect(res => {
          expectTenantData(
            expect(res.body),
            this.categories,
            1,
            barTenant,
            true,
          );
        });
      expect(pending).to.be.true;

      clock.tick(3000);
      const result = await fooReqProm;
      expect(pending).to.be.false;

      const resultBody = await result.json();

      expectTenantData(expect(resultBody), this.categories, 1, fooTenant, true);
      // two requests and one call from setTimeout
      expect(connectionStub).calledTwice;
      expect(connectionStub.returnValues).to.have.lengthOf(2);

      const firstFulfilledRequest = await connectionStub.returnValues[0];
      const secondFulfilledRequest = await connectionStub.returnValues[1];
      expect(firstFulfilledRequest).to.not.deep.equal(secondFulfilledRequest);

      expectRLSInstanceTenant(firstFulfilledRequest, barTenant);
      expectRLSInstanceTenant(secondFulfilledRequest, fooTenant);
    });
  });
});

function getAuthRequest(
  app: INestApplication,
  method: 'get' | 'post' | 'patch' | 'put',
  url: string,
  tenant: TenancyModelOptions,
) {
  return request(app.getHttpServer())
    [method](url)
    .set('tenant_id', tenant.tenantId as string)
    .set('actor_id', tenant.actorId as string);
}

function expectRLSInstanceTenant(
  connection: DataSource,
  tenant: TenancyModelOptions,
) {
  expect(connection).to.be.instanceOf(RLSConnection);
  expect(connection)
    .to.have.property('actorId')
    .and.to.be.equal(tenant.actorId.toString());
  expect(connection)
    .to.have.property('tenantId')
    .and.to.be.equal(tenant.tenantId.toString());
}
