import { Module } from '@nestjs/common';
import { PermissionsService } from './permissions.service';
import { PermissionsController } from './permissions.controller';
import { PermissionGuard } from '../../gateway/guards/permission.guard';

@Module({
  controllers: [PermissionsController],
  providers:   [PermissionsService, PermissionGuard],
  exports:     [PermissionsService, PermissionGuard],
})
export class PermissionsModule {}
