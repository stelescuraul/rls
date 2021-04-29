import { Provider } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EntityClassOrSchema } from '@nestjs/typeorm/dist/interfaces/entity-class-or-schema.type';
import { TENANT_CONNECTION } from 'lib';
import {
  AbstractRepository,
  Connection,
  ConnectionOptions,
  Repository,
} from 'typeorm';

export const createTypeormRLSProviders = (
  entities?: EntityClassOrSchema[],
  connection?: Connection | ConnectionOptions | string,
): Provider[] => {
  return (entities || []).map(entity => {
    return {
      provide: getRepositoryToken(entity, connection as any),
      useFactory: (connection: Connection) => {
        if (
          entity instanceof Function &&
          (entity.prototype instanceof Repository ||
            entity.prototype instanceof AbstractRepository)
        ) {
          return connection.getCustomRepository(entity);
        }

        return connection.options.type === 'mongodb'
          ? connection.getMongoRepository(entity)
          : connection.getRepository(entity);
      },
      inject: [TENANT_CONNECTION],
    };
  });
};
