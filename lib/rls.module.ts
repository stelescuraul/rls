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
import { RLSConnection } from './common';
import { TenancyModelOptions } from './interfaces/tenant-options.interface';
import { TENANT_CONNECTION } from './rls.constants';
import { createTypeormRLSProviders } from './rls.provider';
import { Connection, ConnectionOptions } from 'typeorm';

@Module({
  providers: [
    {
      provide: TENANT_CONNECTION,
      useValue: TENANT_CONNECTION,
    },
  ],
})
export class RLSModule {
  static forFeature(
    entities: EntityClassOrSchema[] = [],
    connection?: Connection | ConnectionOptions | string,
  ) {
    return createTypeormRLSProviders(entities, connection);
  }

  static forRoot(
    // eslint-disable-next-line @typescript-eslint/ban-types
    injectServices: (string | symbol | Function | Type<any> | Abstract<any>)[],
    isolationExtractorFactory: (request, ...args) => TenancyModelOptions,
  ): DynamicModule {
    const rlsProvider: Provider = {
      provide: TENANT_CONNECTION,
      inject: [REQUEST, Connection, ...injectServices],
      scope: Scope.REQUEST,
      useFactory: (request: Request, connection: Connection, ...args) => {
        const tenantModelOptions: TenancyModelOptions = isolationExtractorFactory(
          request,
          ...args,
        );
        return new RLSConnection(connection, tenantModelOptions);
      },
    };

    return {
      module: RLSModule,
      providers: [rlsProvider],
      exports: [TENANT_CONNECTION],
    };
  }
}
