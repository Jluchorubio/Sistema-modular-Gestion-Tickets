import {
  IsBoolean,
  IsOptional,
  IsString,
  IsDateString,
  IsIn,
  IsUUID,
  ValidateIf,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const REASONS = ['vacation', 'maternity_leave', 'sick_leave', 'training', 'other'] as const;

export class AvailabilityDto {
  @ApiProperty({ description: 'ID del módulo' })
  @IsUUID()
  module_id: string;

  @ApiProperty({ example: true })
  @IsBoolean()
  is_available: boolean;

  @ApiPropertyOptional({ enum: REASONS })
  @IsOptional()
  @IsString()
  @IsIn(REASONS)
  reason?: string;

  @ApiPropertyOptional({ example: '2026-05-10T00:00:00Z' })
  @ValidateIf((o) => !o.is_available)
  @IsDateString()
  unavailable_from?: string;

  @ApiPropertyOptional({ example: '2026-05-20T23:59:59Z' })
  @ValidateIf((o) => !o.is_available)
  @IsDateString()
  unavailable_to?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
