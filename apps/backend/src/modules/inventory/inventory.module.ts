import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import { QrService } from './qr/qr.service';
import { FilesModule } from '../files/files.module';

@Module({
  imports: [TypeOrmModule.forFeature([]), FilesModule],
  controllers: [InventoryController],
  providers: [InventoryService, QrService],
  exports: [InventoryService],
})
export class InventoryModule {}
