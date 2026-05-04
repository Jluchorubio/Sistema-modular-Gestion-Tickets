import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  @Get()
  async check() {
    try {
      await this.db.query('SELECT 1');
      return { status: 'ok', db: 'ok', timestamp: new Date().toISOString() };
    } catch {
      return { status: 'degraded', db: 'error', timestamp: new Date().toISOString() };
    }
  }
}
