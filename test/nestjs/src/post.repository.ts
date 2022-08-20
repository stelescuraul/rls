import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Post } from 'test/util/entity/Post';
import { Repository } from 'typeorm';

@Injectable()
export class PostRepository extends Repository<Post> {
  constructor(
    @InjectRepository(Post) public readonly postRepository: Repository<Post>,
  ) {
    super(Post, postRepository.manager, postRepository.queryRunner);

    postRepository.extend(this);
  }

  public read() {
    return this.find();
  }
}
