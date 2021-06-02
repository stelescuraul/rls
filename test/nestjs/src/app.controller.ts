import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('/status')
  getStatus(): Promise<any> {
    return this.appService.status();
  }

  @Get('/categories')
  getHello(): Promise<any> {
    return this.appService.getCategories();
  }
}
