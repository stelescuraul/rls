[![Build And Test](https://github.com/Avallone-io/rls/actions/workflows/build-and-test.yml/badge.svg?branch=master)](https://github.com/Avallone-io/rls/actions/workflows/build-and-test.yml)
[![.github/workflows/release.yml](https://github.com/Avallone-io/rls/actions/workflows/release.yml/badge.svg?branch=master)](https://github.com/Avallone-io/rls/actions/workflows/release.yml)

# Description

Row level security utilitary package to apply to NestJS and TypeORM.

This solution does not work by having multiple connections to database (eg: one connection / tenant). Instead, this solution works by applying the database policies for RLS as described in [this aws blog post](https://aws.amazon.com/blogs/database/multi-tenant-data-isolation-with-postgresql-row-level-security/) (under the **_Alternative approach_**).

# Install

> $ npm install @avallone-io/rls

# Usage

To create a RLSConnection instance you'll need the original connection to db. Setup the typeorm config as usual, then wrap its connection into a **RLSConnection** instance, for each request.

This will run a `set "rls.tenant_id"` and `set "rls.actor_id"` for each request and will reset them after the query is executed.

---

**RLS Policies**

Your database policies will **have to** make use of `rls.tenant_id` and `rls.actor_id` in order to apply the isolation. Policy example:

```sql
CREATE POLICY tenant_isolation ON public."category" for ALL
USING ("tenant_id" = current_setting('rls.tenant_id'))
with check ("tenant_id" = current_setting('rls.tenant_id'));
```

---

## Express/KOA

For example, assuming an express application:

```typescript
app.use((req, res, next) => {
  const connection = getConnection(); // get default typeorm connection

  // get tenantId and actorId from somewhere (headers/token etc)
  const rlsConnection = new RLSConnection(connection, {
    actorId,
    tenantId,
  });

  res.locals.connection = rlsConnection;
  next();
});

// your handlers
const userRepo = res.locals.connection.getRepository(User);
await userRepo.find(); // will return only the results where the db rls policy applies
```

In the above example, you'll have to work with the supplied connection. Calling TypeORM function directly will work with the original connection which is not RLS aware.

## NestJS integration

If you are using NestJS, this library provides helpers for making your connections and queries tenant aware.

Create your TypeORM config and load the TypeORM module using `.forRoot`. Then you'll need to load the `RLSModule` with `.forRoot` where you'll define where to take the `tenantId` and `actorId` from. The second part is that you now need to replace the `TypeOrmModule.forFeature` with `RLSModule.forFeature`.
You can inject non-entity dependent Modules and Providers. First array imports modules, second array injects providers.

When using `RLSModule.forRoot` it will set your `scope` to `REQUEST`! Be sure you understand the implications of this and especially read about the request-scoped authentication strategy on [Nestjs docs](https://docs.nestjs.com/security/authentication#request-scoped-strategies).

```typescript
app.controller.ts

@Module({
  imports: [
    TypeOrmModule.forRoot(...),
    RLSModule.forRoot([/*Module*/], [/*Service*/], (req: Request, /*serviceInstance*/) => {
      // You can take the tenantId and actorId from headers/tokens etc
      const tenantId = req.headers['tenant_id'];
      const actorId = req.headers['actor_id'];

      return {
        actorId,
        tenantId,
      };
    }),
    RLSModule.forFeature([Post, Category]) // <- this
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
```

Now you can use the normal module injection for repositories, services etc.

To inject the RLS connection within a service, you can do by using `@Inject(TENANT_CONNECTION)` where `TENANT_CONNECTION` is imported from `@avallone-io/rls`.

```typescript
export class AppService {
  constructor(
    @InjectRepository(Category)
    private categoryRepo: Repository<Category>,
    @Inject(TENANT_CONNECTION)
    private connection: RLSConnection,
  ) {}

  // you can now use categoryRepo as normal but it will
  // be scoped for RLS. Same with the connection.
}
```

Same as before, do not use the TypeORM functions directly (eg: `getConnection()`) as that will give you the default connection to the database, not the wrapped instance.

For more specific examples, check the `test/nestjs/src`.
