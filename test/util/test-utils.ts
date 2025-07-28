/**
 * File copied from https://github.com/typeorm/typeorm/blob/master/test/utils/test-utils.ts
 * It is created by TypeORM team but it is not exposed when published
 * Slightly modified for convenience
 */
import {
  DatabaseType,
  EntitySchema,
  NamingStrategyInterface,
  DataSource,
  Logger,
  DataSourceOptions,
} from 'typeorm';
import { QueryResultCache } from 'typeorm/cache/QueryResultCache';
import { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions';

const host = process.env.POSTGRES_HOST;
const port = process.env.POSTGRES_PORT;

const config: PostgresConnectionOptions = {
  type: 'postgres',
  host: host || 'localhost',
  port: parseInt(port) || 5440,
  username: 'postgres',
  password: '',
  database: 'postgres',
  logging: false,
};

/**
 * Options used to create a connection for testing purposes.
 */
export interface TestingOptions {
  /**
   * Dirname of the test directory.
   * If specified, entities will be loaded from that directory.
   */
  // eslint-disable-next-line @typescript-eslint/naming-convention
  __dirname?: string;

  /**
   * Connection name to be overridden.
   * This can be used to create multiple connections with single connection configuration.
   */
  name?: string;

  /**
   * List of enabled drivers for the given test suite.
   */
  enabledDrivers?: DatabaseType[];

  /**
   * Entities needs to be included in the connection for the given test suite.
   */
  entities?: (string | Function | EntitySchema<any>)[];

  /**
   * Migrations needs to be included in connection for the given test suite.
   */
  migrations?: string[];

  /**
   * Subscribers needs to be included in the connection for the given test suite.
   */
  subscribers?: string[] | Function[];

  /**
   * Indicates if schema sync should be performed or not.
   */
  schemaCreate?: boolean;

  /**
   * Indicates if schema should be dropped on connection setup.
   */
  dropSchema?: boolean;

  /**
   * Enables or disables logging.
   */
  logging?: boolean;

  /**
   * Schema name used for postgres driver.
   */
  schema?: string;

  /**
   * Naming strategy defines how auto-generated names for such things like table name, or table column gonna be
   * generated.
   */
  namingStrategy?: NamingStrategyInterface;

  /**
   * Schema name used for postgres driver.
   */
  cache?:
    | boolean
    | {
        /**
         * Type of caching.
         *
         * - "database" means cached values will be stored in the separate table in database. This is default value.
         * - "mongodb" means cached values will be stored in mongodb database. You must provide mongodb connection options.
         * - "redis" means cached values will be stored inside redis. You must provide redis connection options.
         */
        readonly type?: 'database' | 'redis' | 'ioredis' | 'ioredis/cluster'; // todo: add mongodb and other cache providers as well in the future

        /**
         * Factory function for custom cache providers that implement QueryResultCache.
         */
        readonly provider?: (connection: DataSource) => QueryResultCache;

        /**
         * Used to provide mongodb / redis connection options.
         */
        options?: any;

        /**
         * If set to true then queries (using find methods and QueryBuilder's methods) will always be cached.
         */
        alwaysEnabled?: boolean;

        /**
         * Time in milliseconds in which cache will expire.
         * This can be setup per-query.
         * Default value is 1000 which is equivalent to 1 second.
         */
        duration?: number;
      };

  /**
   * Options that may be specific to a driver.
   * They are passed down to the enabled drivers.
   */
  driverSpecific?: Record<any, any>;

  /**
   * Factory to create a logger for each test connection.
   */
  createLogger?: () =>
    | 'advanced-console'
    | 'simple-console'
    | 'file'
    | 'debug'
    | Logger;
}

/**
 * Creates a testing connection options for the given driver type based on the configuration in the ormconfig.json
 * and given options that can override some of its configuration for the test-specific use case.
 */
export function getConnectionOptions(
  driverType: DatabaseType,
  options: TestingOptions,
  typeormConfig?: DataSourceOptions,
): DataSourceOptions | undefined {
  const testingConnection = _getConnectionOptions(
    {
      name: options.name ? options.name : undefined,
      entities: options.entities ? options.entities : [],
      subscribers: options.subscribers ? options.subscribers : [],
      dropSchema: options.dropSchema ? options.dropSchema : false,
      schemaCreate: options.schemaCreate ? options.schemaCreate : false,
      enabledDrivers: [driverType],
      cache: options.cache,
      schema: options.schema ? options.schema : undefined,
      namingStrategy: options.namingStrategy
        ? options.namingStrategy
        : undefined,
      logging: options.logging ?? false,
    },
    typeormConfig ? typeormConfig : undefined,
  );

  return testingConnection;
}

/**
 * Loads test connection options from ormconfig.json file.
 */
export function getTypeOrmConfig(): PostgresConnectionOptions {
  return config;
}

/**
 * Creates a testing connections options based on the configuration in the ormconfig.json
 * and given options that can override some of its configuration for the test-specific use case.
 */
function _getConnectionOptions(
  options: TestingOptions,
  typeormConfigs?: DataSourceOptions,
): DataSourceOptions {
  const ormConfigConnectionOptions = typeormConfigs
    ? typeormConfigs
    : getTypeOrmConfig();

  if (!ormConfigConnectionOptions)
    throw new Error(
      `No connections setup in ormconfig.json file. Please create configurations for each database type to run tests.`,
    );

  const newOptions: any = Object.assign({}, ormConfigConnectionOptions, {
    name: options.name ? options.name : ormConfigConnectionOptions.name,
    entities: options.entities ? options.entities : [],
    migrations: options.migrations ? options.migrations : [],
    subscribers: options.subscribers ? options.subscribers : [],
    dropSchema: options.dropSchema !== undefined ? options.dropSchema : false,
    cache: options.cache,
    driverSpecific: options.driverSpecific,
    schemaCreate: options.schemaCreate,
    schema: options.schema,
    logging: options.logging ?? false,
    logger: options.createLogger ? options.createLogger() : undefined,
    namingStrategy: options.namingStrategy,
  });

  return newOptions;
}

/**
 * Closes testing connections if they are connected.
 */
export function closeConnections(connections: DataSource[]) {
  return Promise.all(
    connections.map(connection =>
      connection && connection.isInitialized ? connection.destroy() : undefined,
    ),
  );
}

/**
 * Reloads all databases for all given connections.
 */
export function resetDatabases(connections: DataSource[]) {
  return Promise.all(
    connections.map(connection => connection.synchronize(true)),
  );
}
