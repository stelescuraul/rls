import {
  Abstract,
  DynamicModule,
  ForwardReference,
  Global,
  Module,
  Provider,
  Scope,
  Type,
} from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { EntityClassOrSchema } from '@nestjs/typeorm/dist/interfaces/entity-class-or-schema.type';
import { Request } from 'express';
import { RLSConnection } from './common';
import { TenancyModelOptions } from './interfaces/tenant-options.interface';
import { TENANT_CONNECTION } from './rls.constants';
import { createTypeormRLSProviders } from './rls.provider';
import { DataSource, DataSourceOptions } from 'typeorm';
import { EntitiesMetadataStorage } from '@nestjs/typeorm/dist/entities-metadata.storage';
import { DEFAULT_DATA_SOURCE_NAME } from '@nestjs/typeorm/dist/typeorm.constants';

@Global()
@Module({})
export class RLSModule {
  static forFeature(
    entities: EntityClassOrSchema[] = [],
    connection:
      | DataSource
      | DataSourceOptions
      | string = DEFAULT_DATA_SOURCE_NAME,
  ): DynamicModule {
    const providers = createTypeormRLSProviders(entities, connection);
    EntitiesMetadataStorage.addEntitiesByDataSource(connection, [...entities]);
    return {
      module: RLSModule,
      providers: providers,
      exports: providers,
      global: true,
    };
  }

  static forRoot(
    importModules: (
      | DynamicModule
      | Type<any>
      | Promise<DynamicModule>
      | ForwardReference<any>
    )[],
    // eslint-disable-next-line @typescript-eslint/ban-types
    injectServices: (string | symbol | Function | Type<any> | Abstract<any>)[],
    extractTenant: (
      request,
      ...args
    ) => TenancyModelOptions | Promise<TenancyModelOptions>,
  ): DynamicModule {
    const rlsProvider: Provider = {
      provide: TENANT_CONNECTION,
      inject: [REQUEST, DataSource, ...injectServices],
      scope: Scope.REQUEST,
      useFactory: async (request: Request, connection: DataSource, ...args) => {
        const tenantModelOptions: TenancyModelOptions = await extractTenant(
          request,
          ...args,
        );
        return new RLSConnection(connection, tenantModelOptions);
      },
    };

    return {
      module: RLSModule,
      imports: importModules,
      providers: [rlsProvider],
      exports: [TENANT_CONNECTION],
    };
  }
}
