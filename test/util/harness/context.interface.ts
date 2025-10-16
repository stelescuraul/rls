import { RLSConnection } from 'lib/common';
import { TenancyModelOptions } from 'lib/interfaces';
import { Context, Suite } from 'mocha';
import { DataSource } from 'typeorm';
import { Category } from '../entity/Category';
import { Post } from '../entity/Post';

export type CustomMochaTestContext = {
  fooTenant: TenancyModelOptions;
  fooConnection: RLSConnection;
  barTenant: TenancyModelOptions;
  barConnection: RLSConnection;
  migrationDataSource: DataSource;
  rlsDataSource: DataSource;
  singlePoolRlsDataSource: DataSource;
  categories: Category[];
  posts: Post[];
  tenantDbUser: string;
};

export type CustomSuite = Suite &
  CustomMochaTestContext & {
    parent: CustomSuite | null;
  };
export type CustomExecutionContext = Context & {
  test: {
    parent: CustomSuite;
  };
};
