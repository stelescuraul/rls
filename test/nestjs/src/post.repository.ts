import { Post } from 'test/util/entity/Post';
import { EntityRepository, Repository } from 'typeorm';

@EntityRepository(Post)
export class PostRepository extends Repository<Post> {
  public read() {
    return this.find();
  }
}
