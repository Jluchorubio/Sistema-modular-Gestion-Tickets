import { IsIn, IsOptional, IsString, IsUUID, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const STATUSES = ['disponible', 'ocupado', 'en_reunion', 'fuera_horario', 'ausente', 'offline'] as const;

export class SelfAvailabilityDto {
  @ApiProperty({ description: 'ID del módulo' })
  @IsUUID()
  module_id: string;

  @ApiProperty({ enum: STATUSES, example: 'disponible' })
  @IsString()
  @IsIn(STATUSES)
  status: string;

  @ApiPropertyOptional({ example: '2026-05-30T23:59:59Z' })
  @IsOptional()
  @IsDateString()
  unavailable_to?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
