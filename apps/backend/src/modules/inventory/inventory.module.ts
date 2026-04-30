import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import { QrService } from './qr/qr.service';

// future microservice: inventory-service
@Module({
  imports: [TypeOrmModule.forFeature([])],
  controllers: [InventoryController],
  providers: [InventoryService, QrService],
  exports: [InventoryService],
})
export class InventoryModule {}
