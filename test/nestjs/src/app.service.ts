import { Injectable, Scope } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Category } from 'test/util/entity/Category';
import { Repository } from 'typeorm';

@Injectable({
  scope: Scope.REQUEST,
})
export class AppService {
  constructor(
    @InjectRepository(Category)
    private categoryRepo: Repository<Category>,
  ) {}

  async status(): Promise<any> {
    return 'ok';
  }

  async getCategories() {
    return this.categoryRepo.find();
  }
}
