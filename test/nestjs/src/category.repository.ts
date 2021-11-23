import { Category } from 'test/util/entity/Category';
import { EntityRepository, Repository } from 'typeorm';

@EntityRepository(Category)
export class CategoryRepository extends Repository<Category> {
  public read() {
    return this.find();
  }
}
