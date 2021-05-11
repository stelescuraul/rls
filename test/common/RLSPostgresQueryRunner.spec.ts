import {
  closeTestingConnections,
  reloadTestingDatabases,
  setupSingleTestingConnection,
} from '../util/test-utils';
import { Connection, createConnection, QueryFailedError } from 'typeorm';
import {
  RLSConnection,
  RLSPostgresDriver,
  RLSPostgresQueryRunner,
} from '../../lib/common';
import { TenancyModelOptions } from '../interfaces';
import { expect } from 'chai';
import * as sinon from 'sinon';
import { PostgresQueryRunner } from 'typeorm/driver/postgres/PostgresQueryRunner';
import { Post } from './entity/Post';
import { Category } from './entity/Category';

describe('RLSPostgresQueryRunner', () => {
  let connection: RLSConnection;
  let originalConnection: Connection;
  let driver: RLSPostgresDriver;

  let queryRunner: RLSPostgresQueryRunner;

  const fooTenant: TenancyModelOptions = {
    actorId: 10,
    tenantId: 1,
  };

  const barTenant: TenancyModelOptions = {
    actorId: 20,
    tenantId: 2,
  };

  before(async () => {
    const connectionOptions = await setupSingleTestingConnection('postgres', {
      entities: [__dirname + '/entity/*{.js,.ts}'],
      dropSchema: true,
      schemaCreate: true,
    });

    originalConnection = await createConnection(connectionOptions);
    connection = new RLSConnection(originalConnection, fooTenant);
    driver = connection.driver;
  });
  beforeEach(async () => {
    await reloadTestingDatabases([connection]);
    queryRunner = new RLSPostgresQueryRunner(driver, 'master', fooTenant);
  });
  afterEach(async () => queryRunner.release());
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
      new RLSPostgresQueryRunner(driver, 'master', fooTenant),
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
        fooTenant,
        () => new RLSPostgresQueryRunner(driver, 'master', fooTenant),
      );
    });

    describe('$RLSPostgresDriver', () => {
      runQueryTests(fooTenant, () => driver.createQueryRunner('master'));
    });

    describe('$RLSConnection', () => {
      runQueryTests(fooTenant, () => connection.createQueryRunner());
    });
  });

  describe.only('multi-tenant', () => {
    const tenantDbUser = 'tenant_aware_user';
    let categories: Category[];
    let posts: Post[];

    beforeEach(async () => {
      const testData = await setupMultiTenant(
        queryRunner,
        fooTenant,
        barTenant,
        tenantDbUser,
      );

      categories = testData.categories;
      posts = testData.posts;
    });
    afterEach(() => resetMultiTenant(queryRunner, tenantDbUser));

    describe('virtual connection', () => {
      it('should use the correct user', async () => {
        const [result] = await queryRunner.query(
          `select current_user as "currentUser"`,
        );

        expect(result.currentUser).to.be.equal(tenantDbUser);
      });

      it('should have the tenantId set', async () => {
        const [result] = await queryRunner.query(
          `select current_setting('settings.tenant_id') as "tenantId"`,
        );

        expect(parseInt(result.tenantId)).to.be.equal(fooTenant.tenantId);
      });

      it('should have the actor_id set', async () => {
        const [result] = await queryRunner.query(
          `select current_setting('settings.actor_id') as "actorId"`,
        );

        expect(parseInt(result.actorId)).to.be.equal(fooTenant.actorId);
      });

      it('should return the right category', async () => {
        return expect(queryRunner.query(`select * from category`))
          .to.eventually.have.lengthOf(1)
          .and.to.have.same.deep.members(
            categories
              .filter(x => x.tenantId === fooTenant.tenantId)
              .map(x => x.toJson()),
          );
      });

      it('should return the right posts', async () => {
        return expect(queryRunner.query(`select * from post`))
          .to.eventually.have.lengthOf(1)
          .and.to.have.same.deep.members(
            posts
              .filter(
                x =>
                  x.tenantId === fooTenant.tenantId &&
                  x.userId === fooTenant.actorId,
              )
              .map(x => x.toJson()),
          );
      });

      it('should not overwrite the tenantId', async () => {
        return expect(
          queryRunner.query(`select * from category where "tenantId" in ($1)`, [
            categories
              .filter(x => x.tenantId !== fooTenant.tenantId)
              .map(x => x.tenantId)
              .join(','),
          ]),
        ).to.eventually.have.lengthOf(0);
      });

      it('should not overwrite the tenantId or actorId', async () => {
        return expect(
          queryRunner.query(
            `select * from post where "tenantId" in ($1) or "userId" in ($2)`,
            [barTenant.tenantId, barTenant.actorId],
          ),
        ).to.eventually.have.lengthOf(0);
      });

      it('should not allow to insert for any tenant', async () => {
        return expect(
          queryRunner.query(
            `insert into category values (default, 66, 'not allowed')`,
          ),
        ).to.be.rejectedWith(
          QueryFailedError,
          /new row violates row-level security policy for table "category"/,
        );
      });

      it('should allow to insert for the right tenant', async () => {
        await expect(
          queryRunner.query(
            `insert into category values (default, $1, 'allowed')`,
            [fooTenant.tenantId],
          ),
        ).to.be.fulfilled;

        return expect(
          queryRunner.query(`select * from category where name = 'allowed'`),
        ).to.eventually.have.lengthOf(1);
      });

      it('should not allow to insert for wrong actorId', async () => {
        return expect(
          queryRunner.query(
            `insert into post values (default, $1, $2, 'not allowed')`,
            [fooTenant.tenantId, 11],
          ),
        ).to.be.rejectedWith(
          QueryFailedError,
          /new row violates row-level security policy for table "post"/,
        );
      });

      it(`should allow to insert for right actorId`, async () => {
        await expect(
          queryRunner.query(
            `insert into post values (default, $1, $2, 'allowed')`,
            [fooTenant.tenantId, fooTenant.actorId],
          ),
        ).to.be.fulfilled;

        return expect(
          queryRunner.query(`select * from post where title = 'allowed'`),
        ).to.eventually.have.lengthOf(1);
      });

      it(`should only update the tenant's data`, async () => {
        await queryRunner.query(`update category set name = 'allowed'`);

        return expect(
          originalConnection.query(
            `select * from category where name = 'allowed'`,
          ),
        ).to.eventually.have.lengthOf(1);
      });

      it(`should only update the right actor's data`, async () => {
        await queryRunner.query(`update post set title = 'allowed'`);

        return expect(
          originalConnection.query(
            `select * from post where title = 'allowed'`,
          ),
        ).to.eventually.have.lengthOf(1);
      });
    });

    describe('original connection', () => {
      it('should use postgres user', async () => {
        const [result] = await originalConnection.query(
          `select current_user as "currentUser"`,
        );

        expect(result.currentUser).to.be.equal('postgres');
      });

      it('should not have the tenantId set', async () => {
        return expect(
          originalConnection.query(
            `select current_setting('settings.tenant_id') as "tenantId"`,
          ),
        ).to.be.rejectedWith(
          QueryFailedError,
          /unrecognized configuration parameter "settings.tenant_id"/,
        );
      });

      it('should not have the actorId set', async () => {
        return expect(
          originalConnection.query(
            `select current_setting('settings.actor_id') as "actorId"`,
          ),
        ).to.be.rejectedWith(
          QueryFailedError,
          /unrecognized configuration parameter "settings.actor_id"/,
        );
      });

      it('should return all categories', () => {
        return expect(originalConnection.query(`select * from category`))
          .to.eventually.have.lengthOf(2)
          .and.to.have.same.deep.members(categories.map(x => x.toJson()));
      });

      it('should return all posts', () => {
        return expect(originalConnection.query(`select * from post`))
          .to.eventually.have.lengthOf(3)
          .and.to.have.same.deep.members(posts.map(x => x.toJson()));
      });

      it('should allow to insert for any tenant', async () => {
        await originalConnection.query(
          `insert into category values (default, 66, 'allowed')`,
        );

        return expect(
          originalConnection.query(
            `select * from category where "tenantId" = 66`,
          ),
        ).to.eventually.have.lengthOf(1);
      });

      it('should allow to insert for any actor', async () => {
        await originalConnection.query(
          `insert into post values (default, 66, 66, 'allowed')`,
        );

        return expect(
          originalConnection.query(`select * from post where "userId" = 66`),
        ).to.eventually.have.lengthOf(1);
      });

      it('should be allowed to update for any tenant', async () => {
        await originalConnection.query(`update category set name = 'allowed'`);

        return expect(
          originalConnection.query(`select * from category`),
        ).to.eventually.have.lengthOf(2);
      });
    });

    describe('multiple-qr', () => {
      let localQueryRunner: RLSPostgresQueryRunner;
      beforeEach(() => {
        localQueryRunner = new RLSPostgresQueryRunner(driver, 'master', {
          tenantId: barTenant.tenantId,
          actorId: barTenant.actorId,
        });
      });

      afterEach(() => localQueryRunner.release());

      it('should not have race conditions', async () => {});
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

async function setupMultiTenant(
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

  await queryRunner.query(`set role ${tenantDbUser}`);

  return {
    categories: [fooCategory, barCategory],
    posts: [fooPost, foofooPost, barPost],
  };
}

async function resetMultiTenant(
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
