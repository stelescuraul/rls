import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { expect } from 'chai';
import { TenancyModelOptions } from 'lib/interfaces';
import * as request from 'supertest';
import { AppModule } from 'test/nestjs/src/app.module';
import { Category } from 'test/util/entity/Category';
import { Post } from 'test/util/entity/Post';
import {
  createData,
  createTeantUser,
  expectTenantData,
  resetMultiTenant,
  setupMultiTenant,
} from 'test/util/helpers';
import {
  closeTestingConnections,
  getTypeOrmConfig,
  setupSingleTestingConnection,
  TestingConnectionOptions,
} from 'test/util/test-utils';
import { Connection, createConnection } from 'typeorm';
const configs = getTypeOrmConfig();

describe.only('RLS Module', () => {
  let app: INestApplication;
  const tenantDbUser = 'tenant_aware_user';
  let migrationConnection: Connection;
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
    migrationConnection = await setupDatabase(
      migrationConnection,
      tenantDbUser,
    );
    const testData = await createData(
      fooTenant,
      barTenant,
      migrationConnection,
    );
    categories = testData.categories;
    posts = testData.posts;

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  after(async () => {
    await resetMultiTenant(migrationConnection, tenantDbUser);
    await closeTestingConnections([migrationConnection]);

    await app.close();
  });

  it(`GET /status`, () => {
    return request(app.getHttpServer()).get('/status').expect(200).expect('ok');
  });

  it('GET /categories for foo tenant', () => {
    return getAuthRequest(app, 'get', '/categories', fooTenant)
      .expect(200)
      .expect(res => {
        expectTenantData(expect(res.body), categories, 1, fooTenant, true);
      });
  });
});

async function setupDatabase(
  migrationConnection: Connection,
  tenantDbUser: string,
): Promise<Connection> {
  const migrationConnectionOptions = setupSingleTestingConnection(
    'postgres',
    {
      entities: [Post, Category],
      schemaCreate: true,
      dropSchema: true,
    },
    {
      ...configs[0],
      name: 'migrationConnection',
      synchronize: true,
    } as TestingConnectionOptions,
  );

  migrationConnection = await createConnection(migrationConnectionOptions);
  await createTeantUser(migrationConnection, tenantDbUser);
  await setupMultiTenant(migrationConnection, tenantDbUser);
  return migrationConnection;
}

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
