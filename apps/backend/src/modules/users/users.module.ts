import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { ProfileService } from './profile.service';
import { RoleService } from './role.service';
import { SkillService } from './skill.service';
import { MessagingModule } from '../../shared/messaging/messaging.module';

@Module({
  imports: [MessagingModule],
  controllers: [UsersController],
  providers: [UsersService, ProfileService, RoleService, SkillService],
  exports: [UsersService, ProfileService, RoleService, SkillService],
})
export class UsersModule {}
