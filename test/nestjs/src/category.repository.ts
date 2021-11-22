import { Category } from 'test/util/entity/Category';
import { EntityRepository, Repository } from 'typeorm';

@EntityRepository(Category)
export class CategoryRepository extends Repository<Category> {
  public dummy() {
    console.log('dummy function called');
  }
}
