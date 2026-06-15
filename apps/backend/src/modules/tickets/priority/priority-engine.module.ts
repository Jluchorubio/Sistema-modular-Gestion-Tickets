import { Global, Module } from '@nestjs/common';
import { PriorityEngineService } from './priority-engine.service';

@Global()
@Module({
  providers: [PriorityEngineService],
  exports:   [PriorityEngineService],
})
export class PriorityEngineModule {}
