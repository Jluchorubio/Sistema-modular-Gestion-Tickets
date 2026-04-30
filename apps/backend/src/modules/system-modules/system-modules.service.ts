import { Injectable } from '@nestjs/common';

// future microservice: modules-service
@Injectable()
export class SystemModulesService {
  findAll() {
    return [];
  }

  findOne(_id: string) {
    return null;
  }

  create(_dto: Record<string, unknown>) {
    return null;
  }
}
