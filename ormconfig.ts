import { TestingConnectionOptions } from 'test/util/test-utils';

const host = process.env.POSTGRES_HOST;
const port = process.env.POSTGRES_PORT;

export const configs: TestingConnectionOptions[] = [
  {
    skip: false,
    type: 'postgres',
    host: host || 'localhost',
    port: parseInt(port) || 5440,
    username: 'postgres',
    password: '',
    database: 'postgres',
    logging: false,
  },
];
