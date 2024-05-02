##### Table of Contents 
[Description](#description)
[Install](#install)
[Usage](#usage)
[Local Testing](#localtesting)
[Publish Package](#publish)


[![Build And Test](https://github.com/Avallone-io/rls/actions/workflows/build-and-test.yml/badge.svg?branch=master)](https://github.com/Avallone-io/rls/actions/workflows/build-and-test.yml)
[![.github/workflows/release.yml](https://github.com/Avallone-io/rls/actions/workflows/release.yml/badge.svg?branch=master)](https://github.com/Avallone-io/rls/actions/workflows/release.yml)

<a href="description"/>

# Description

Row level security utilitary package to apply to NestJS and TypeORM.

This solution does not work by having multiple connections to database (eg: one connection / tenant). Instead, this solution works by applying the database policies for RLS as described in [this aws blog post](https://aws.amazon.com/blogs/database/multi-tenant-data-isolation-with-postgresql-row-level-security/) (under the **_Alternative approach_**).

<a href="install"/>

# Install

> $ npm install @nestwealth/nw-rls@{$version}

<a href="usage"/>

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
  const dataSource = await new DataSource({...}).initialize(); // create a datasource and initialize it

  // get tenantId and actorId from somewhere (headers/token etc)
  const rlsConnection = new RLSConnection(dataSource, {
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

In the above example, you'll have to work with the supplied connection. Calling TypeORM function directly will work with the original DataSource object which is not RLS aware.

## NestJS integration

If you are using NestJS, this library provides helpers for making your connections and queries tenant aware.

Create your TypeORM config and load the TypeORM module using `.forRoot`. Then you'll need to load the `RLSModule` with `.forRoot` where you'll define where to take the `tenantId` and `actorId` from. The second part is that you now need to replace the `TypeOrmModule.forFeature` with `RLSModule.forFeature`. This should be a 1-to-1 replacement.
You can inject non-entity dependent Modules and Providers. First array imports modules, second array injects providers.

When using `RLSModule.forRoot` it will set your `scope` to `REQUEST`! Be sure you understand the implications of this and especially read about the request-scoped authentication strategy on [Nestjs docs](https://docs.nestjs.com/security/authentication#request-scoped-strategies).

The `RLSModule.forRoot` accepts the factory funtion as async or non-async function.

```typescript
app.controller.ts

@Module({
  imports: [
    TypeOrmModule.forRoot(...),
    RLSModule.forRoot([/*Module*/], [/*Service*/], async (req: Request, /*serviceInstance*/) => {
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

Same as before, do not use the TypeORM functions directly from the `dataSource` as that will give you the default connection to the database, not the wrapped instance.

For more specific examples, check the `test/nestjs/src`.

# Typeorm >v0.3.0
Since typeorm v0.3.0, the Connection class has been replaced by DataSource. This module still uses Connection as its language which is also helpful now to differenciate between the actual database connection (typeorm DataSource) and RLS wrapper (RLSConnection). However, if you want to be on par with typeorm terminalogy, there is an alias for `RLSConnection` called `RLSDataSource`.

<a href="localtesting"/>

# Local Testing
When testing a package locally, there have been issues symlinking using `npm/yarn link`. 
Alternatelly you can use `yalc`[https://github.com/wclr/yalc]

How to use `yalc`
Note: `@nestwealth/nw-rls` is the local dependency package and `nacs-onboarding` is the dependent package

1. Install yalc globally
```
npm i -g yalc
```

2. From `nw-rls` 
```
yalc publish
```

3. In `nacs-onboarding`
```
yalc add @nestwealth/nw-rls@{version}
```

4. Install any dependencies in `nacs-onboarding` if required
```
npm i
```

5. If you make any changes to `nw-rls` while testign locally
```
yalc push
```

6. To remove package from `nacs-onboarding`
```
yalc remove @nestwealth/nw-rls@{version}
```

<a href="publish"/>

# Publish Package

Before deploying, check the following items:

-   Do you have an npm account?
-   Does your npm account have write permissions for the [nw-rls package](https://www.npmjs.com/package/@nestwealth/nw-rls) package?
-   Are you locally authenticated as your npm user (use `npm whoami` to check, and `npm adduser` to log in)
-   Are you using the correct node version, using `nvm use` as noted above?

To deploy your changes to the `nw-rls`, ensure your changes have been merged into the `develop` branch of the `nw-rls` repository. Then, locally switch to the `develop` branch and run `git pull`.

**NOTE:** The published version will reflect your current local state, so please ensure you pull all changes in the `develop` branch before publishing

To update the @nestwealth/nw-rls version and publish, run the following commands (selecting the version type based on [semantic versioning](https://docs.npmjs.com/about-semantic-versioning))

```sh
npm version [patch | minor | major]
npm publish
```

**Note:** The `prepublish` script will automatically be run when you run the `npm publish` command. The prepublish script removes any previous builds and builds both the browser and node versions.

Now that the version has been published, create a new branch locally by running the following command (replacing `[NEW_VERSION]` with the newly published version number):

`git checkout -b "chore/bump-version-[NEW_VERSION]"`

Push this new branch, make a PR into `develop` with the change to package.json and share a link for peer review.

Once a new version of the package is published, any repository that uses this package will need to have its `package.json` updated in order to use the new version. For  `nacs-on-boarding`, complete following steps:

Create a new branch in `nacs-on-boarding` by running the following in the root directory of `nacs-on-boarding`:

`git checkout -b "chore/bump-version-[NEW_VERSION]"`

Install the new version of the @nestwealth/nw-rls by running the following in the root directory of `nacs-on-boarding`:

`npm i --save-exact @nestwealth/nw-rls@[NEW_VERSION]`

Push this new branch, make a PR into `develop` with the change to package.json and share a link for peer review.

Once merged, this will automatically deploy a new version of `nacs-on-boarding` to the development environment using the most up to date version of the @nestwealth/nw-rls, incorporating the latest changes to the onboarding form configuration.