import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';

dotenv.config();

// Used by TypeORM CLI for migrations
export default new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: ['src/**/*.entity.ts'],
  migrations: ['database/migrations/*.ts'],
});
