import { DynamicModule, Module, Provider, Scope } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { EntityClassOrSchema } from '@nestjs/typeorm/dist/interfaces/entity-class-or-schema.type';
import { RLSConnection } from 'lib/common';
import { TENANT_CONNECTION } from 'lib/rls.constants';
import { createTypeormRLSProviders } from 'lib/rls.provider';
import { Connection, ConnectionOptions } from 'typeorm';
import { Request } from 'express';

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

  static forRoot() {
    const rlsProvider: Provider = {
      provide: TENANT_CONNECTION,
      inject: [REQUEST, Connection],
      scope: Scope.REQUEST,
      useFactory: (request: Request, connection: Connection) => {
        
        // Get the actor and tenant from somewhere
        return new RLSConnection(connection);
      },
    };

    return {
      module: RLSModule,
      providers: [],
      exports: TENANT_CONNECTION,
    };
  }
}
