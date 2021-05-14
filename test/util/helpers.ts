import { QueryRunner } from 'typeorm';
import { RLSPostgresDriver, RLSPostgresQueryRunner } from '../../lib/common';
import { TenancyModelOptions } from '../interfaces';
import { expect } from 'chai';
import * as sinon from 'sinon';
import { PostgresQueryRunner } from 'typeorm/driver/postgres/PostgresQueryRunner';
import { Post } from '../common/entity/Post';
import { Category } from '../common/entity/Category';

export async function createRunners(
  tenantOrder: TenancyModelOptions[],
  tenantDbUser: string,
  driver: RLSPostgresDriver,
) {
  const runners: QueryRunner[] = [];

  for (const tenant of tenantOrder) {
    const runner = new RLSPostgresQueryRunner(driver, 'master', tenant);
    await setQueryRunnerRole(runner, tenantDbUser);

    runners.push(runner);
  }

  return runners;
}
export async function releaseRunners(runners: QueryRunner[]) {
  for (const qr of runners) {
    await qr.release();
  }
}
export async function generateQueryStrings(totalRunners: number) {
  const queryStrings: string[] = [];
  for (let i = 0; i < totalRunners; i++) {
    queryStrings.push(`select * from category as c_${i}`);
  }

  return queryStrings;
}
export async function setupResolvers(
  runners: QueryRunner[],
  queryStrings: string[],
  queryPrototypeStub: sinon.SinonStub,
) {
  if (runners.length !== queryStrings.length) {
    throw new Error('Runners and query strings should be equal');
  }

  for (let i = 0; i < runners.length; i++) {
    const resolver = sinon.fake.resolves(
      new Promise(resolve => {
        return setTimeout(async () => {
          resolve(
            queryPrototypeStub.wrappedMethod.bind(runners[i])(queryStrings[i]),
          );
        }, i * 1000 + 1000);
      }),
    );

    queryPrototypeStub.withArgs(queryStrings[i]).resolves(resolver());
  }
}
export function expectSameDataByTenantId(
  barCategories: any[],
  categories: Category[],
  barTenant: TenancyModelOptions,
) {
  expect(barCategories)
    .to.have.lengthOf(1)
    .and.to.be.deep.equal(
      categories
        .filter(c => c.tenantId === barTenant.tenantId)
        .map(c => c.toJson()),
    );
}
export function runQueryTests(
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
    expect(queryPrototypeSpy).to.have.callCount(3);
    expect(querySpy).to.have.callCount(1);
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
export async function setupMultiTenant(
  queryRunner: RLSPostgresQueryRunner,
  fooTenant: TenancyModelOptions,
  barTenant: TenancyModelOptions,
  tenantDbUser: string,
) {
  const fooCategory = await Category.create({
    name: 'FooCategory',
    tenantId: fooTenant.tenantId as number,
  }).save();
  const barCategory = await Category.create({
    name: 'BarCategory',
    tenantId: barTenant.tenantId as number,
  }).save();

  const fooPost = await Post.create({
    tenantId: fooTenant.tenantId as number,
    userId: fooTenant.actorId as number,
    title: 'Foo post',
    categories: [fooCategory],
  }).save();
  const foofooPost = await Post.create({
    tenantId: fooTenant.tenantId as number,
    userId: (fooTenant.actorId as number) + 1,
    title: 'Foofoo post',
    categories: [fooCategory],
  }).save();
  const barPost = await Post.create({
    tenantId: barTenant.tenantId as number,
    userId: barTenant.actorId as number,
    title: 'Bar post',
    categories: [barCategory],
  }).save();

  await queryRunner.query(`drop role if exists ${tenantDbUser}`);
  await queryRunner.query(
    `create user ${tenantDbUser} with password 'password'`,
  );
  await queryRunner.query(
    `alter role ${tenantDbUser} set search_path to public`,
  );
  await queryRunner.query(
    `grant all privileges on all tables in schema public to ${tenantDbUser};
     grant all privileges on all sequences in schema public to ${tenantDbUser};
    `,
  );

  await queryRunner.query(`alter table public."post" enable row level security;
    alter table public."category" enable row level security;`);

  await queryRunner.query(`
    CREATE POLICY tenant_current_tenant_isolation ON public."category" for ALL
    USING ("tenantId" = current_setting('settings.tenant_id')::int4 )
    with check ("tenantId" = current_setting('settings.tenant_id')::int4 );`);

  await queryRunner.query(`
    CREATE POLICY tenant_current_tenant_isolation ON public."post" for ALL
    USING ("tenantId" = current_setting('settings.tenant_id')::int4 
          AND "userId" = current_setting('settings.actor_id')::int4  )
    with check ("tenantId" = current_setting('settings.tenant_id')::int4 
          AND "userId" = current_setting('settings.actor_id')::int4  );`);

  await setQueryRunnerRole(queryRunner, tenantDbUser);

  return {
    categories: [fooCategory, barCategory],
    posts: [fooPost, foofooPost, barPost],
  };
}
export async function setQueryRunnerRole(
  queryRunner: RLSPostgresQueryRunner,
  tenantDbUser: string,
) {
  await queryRunner.query(`set role ${tenantDbUser}`);
}
export async function resetMultiTenant(
  queryRunner: RLSPostgresQueryRunner,
  tenantDbUser: string,
) {
  await queryRunner.query(`reset role`);

  await queryRunner.query(`
    drop policy if exists tenant_current_tenant_isolation on public."category";
    drop policy if exists tenant_current_tenant_isolation on public."post";
    drop policy if exists tenant_current_user_isolation on public."post";
  `);
  await queryRunner.query(
    `
    revoke all privileges on all tables in schema public from ${tenantDbUser};
    revoke all privileges on all sequences in schema public from ${tenantDbUser};
  `,
  );
  await queryRunner.query(`
    alter table public."post" disable row level security;
    alter table public."category" disable row level security;
  `);
  await queryRunner.query(`drop role if exists ${tenantDbUser}`);
}
