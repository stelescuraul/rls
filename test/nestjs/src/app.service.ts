import { Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { RLSConnection } from 'lib/common';
import { TENANT_CONNECTION } from 'lib/rls.constants';
import { Category } from 'test/util/entity/Category';
import { Repository } from 'typeorm';

export class AppService {
  constructor(
    @InjectRepository(Category)
    private categoryRepo: Repository<Category>,
    @Inject(TENANT_CONNECTION)
    private connection: RLSConnection,
  ) {}

  async status(): Promise<any> {
    return 'ok';
  }

  async getCategories() {
    // help to test the connection
    await this.stop();
    await this.getConnection();

    return this.categoryRepo.find();
  }

  async getConnection() {
    return this.connection;
  }

  async stop() {
    return;
  }
}
