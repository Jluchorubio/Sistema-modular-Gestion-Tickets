import { IsString, IsIn, IsOptional, IsObject, MinLength, MaxLength, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export const TASK_SOURCES = ['user', 'system'] as const;

export const REQUEST_TYPES = [
  'role_change',
  'module_access',
  'permission_adjustment',
  'account_issue',
  'reactivation',
  'access_revocation',
  'user_transfer',
  'technical_issue',
  'data_correction',
  'other',
  'task',
] as const;

export type RequestType = typeof REQUEST_TYPES[number];

export const PRIORITY_LEVELS = ['baja', 'media', 'alta', 'critica'] as const;

export class CreateRequestDto {
  @ApiProperty({ description: 'type_key desde config.request_type_config' })
  @IsString() @MinLength(3) @MaxLength(50)
  @Matches(/^[a-z_]+$/, { message: 'type solo puede contener letras minúsculas y guiones bajos' })
  type: string;

  @ApiProperty({ example: 'Solicitud de acceso al módulo Inventario' })
  @IsString()
  @MinLength(5)
  @MaxLength(200)
  title: string;

  @ApiProperty({ example: 'Necesito acceso al módulo de inventario para gestionar activos de mi área.' })
  @IsString()
  @MinLength(10)
  description: string;

  @ApiPropertyOptional({
    enum: PRIORITY_LEVELS,
    description: 'Solo aplica para tipo "other". En todos los demás tipos el sistema calcula la prioridad automáticamente.',
  })
  @IsIn(PRIORITY_LEVELS)
  @IsOptional()
  priority?: string;

  @ApiPropertyOptional({ enum: TASK_SOURCES, default: 'user' })
  @IsIn(TASK_SOURCES)
  @IsOptional()
  task_source?: 'user' | 'system';

  @ApiPropertyOptional({ description: 'Metadata JSON (ej: { module_id, role_id } para solicitudes de módulo)' })
  @IsObject()
  @IsOptional()
  metadata?: Record<string, unknown>;
}
