import { IsString, IsIn, IsOptional, IsObject, MinLength, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export const REQUEST_TYPES = [
  'role_change',
  'module_access',
  'info_correction',
  'sede_change',
  'permission_adjustment',
  'account_issue',
  'reactivation',
  'other',
  'task',
] as const;

export const PRIORITY_LEVELS = ['baja', 'media', 'alta', 'critica'] as const;

export class CreateRequestDto {
  @ApiProperty({ enum: REQUEST_TYPES })
  @IsIn(REQUEST_TYPES)
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

  @ApiPropertyOptional({ enum: PRIORITY_LEVELS, default: 'media' })
  @IsIn(PRIORITY_LEVELS)
  @IsOptional()
  priority?: string;

  @ApiPropertyOptional({ description: 'Metadata JSON (ej: { due_date: "2026-05-20" } para tasks)' })
  @IsObject()
  @IsOptional()
  metadata?: Record<string, unknown>;
}
