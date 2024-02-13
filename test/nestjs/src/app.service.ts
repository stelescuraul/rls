import { Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { RLSConnection } from 'lib/common';
import { TENANT_CONNECTION } from 'lib/rls.constants';
import { Category } from 'test/util/entity/Category';
import { Repository } from 'typeorm';
import { PostRepository } from './post.repository';

export class AppService {
  constructor(
    @InjectRepository(Category)
    private categoryRepo: Repository<Category>,
    @Inject(PostRepository)
    private postRepo: PostRepository,
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

  async getPosts(useStream?: boolean) {
    if (useStream) {
      const result = [];
      const stream = await this.postRepo.createQueryBuilder('post').stream();
      await new Promise<void>((resolve, reject) => {
        stream.on('data', (data: any) => {
          //Query builder does not format the output the same way that the repository does
          result.push({
            id: data.post_id,
            tenantId: data.post_tenantId,
            title: data.post_title,
            userId: data.post_userId,
          });
        });
        stream.on('error', reject);
        stream.on('end', resolve);
      });
      return result;
    }
    return this.postRepo.read();
  }

  async getConnection() {
    return this.connection;
  }

  async stop() {
    return;
  }

  async simulateEntityRemoveRollback() {
    const qr = this.connection.createQueryRunner();
    await qr.startTransaction();
    const manager = qr.manager;
    const [category] = await manager.find(Category, {});
    const responseObject = { categoryId: category.id };
    await manager.remove(category);
    await qr.rollbackTransaction();
    await qr.release();

    return responseObject;
  }
}
