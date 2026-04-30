import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SystemModulesController } from './system-modules.controller';
import { SystemModulesService } from './system-modules.service';

// future microservice: modules-service
@Module({
  imports: [TypeOrmModule.forFeature([])],
  controllers: [SystemModulesController],
  providers: [SystemModulesService],
  exports: [SystemModulesService],
})
export class SystemModulesModule {}
