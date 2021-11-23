import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('/status')
  getStatus(): Promise<any> {
    return this.appService.status();
  }

  @Get('/posts')
  getPosts(): Promise<any> {
    return this.appService.getPosts();
  }

  @Get('/categories')
  getCategories(): Promise<any> {
    return this.appService.getCategories();
  }

  @Get('/simulate-entity-remove-rollback')
  simulateEntityRemoveRollback() {
    return this.appService.simulateEntityRemoveRollback();
  }
}
