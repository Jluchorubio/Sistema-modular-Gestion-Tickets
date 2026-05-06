import { IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AssignRoleDto {
  @ApiProperty({ description: 'ID del módulo' })
  @IsUUID()
  module_id: string;

  @ApiProperty({ description: 'ID del rol en modules.module_roles' })
  @IsUUID()
  role_id: string;
}
