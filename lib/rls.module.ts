import {
  Abstract,
  DynamicModule,
  Module,
  Provider,
  Scope,
  Type,
} from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { EntityClassOrSchema } from '@nestjs/typeorm/dist/interfaces/entity-class-or-schema.type';
import { Request } from 'express';
import { RLSConnection } from 'lib/common';
import { TenancyModelOptions } from 'lib/interfaces/tenant-options.interface';
import { TENANT_CONNECTION } from 'lib/rls.constants';
import { createTypeormRLSProviders } from 'lib/rls.provider';
import { Connection, ConnectionOptions } from 'typeorm';

@Module({})
export class RLSModule {
  static forFeature(
    entities: EntityClassOrSchema[] = [],
    connection:
      | Connection
      | ConnectionOptions
      | string = TENANT_CONNECTION.toString(),
  ): DynamicModule {
    const providers = createTypeormRLSProviders(entities, connection);

    return {
      module: RLSModule,
      providers: providers,
      exports: providers,
    };
  }

  static forRoot(
    // eslint-disable-next-line @typescript-eslint/ban-types
    injectServices: (string | symbol | Function | Type<any> | Abstract<any>)[],
    isolationExtractorFactory: (request, ...args) => TenancyModelOptions,
  ) {
    const rlsProvider: Provider = {
      provide: TENANT_CONNECTION,
      inject: [REQUEST, Connection, ...injectServices],
      scope: Scope.REQUEST,
      useFactory: (request: Request, connection: Connection, ...args) => {
        const tenantModelOptions: TenancyModelOptions = isolationExtractorFactory(
          request,
          ...args,
        );
        // Get the actor and tenant from somewhere
        return new RLSConnection(connection, tenantModelOptions);
      },
    };

    return {
      module: RLSModule,
      providers: [rlsProvider],
      exports: TENANT_CONNECTION,
    };
  }
}
