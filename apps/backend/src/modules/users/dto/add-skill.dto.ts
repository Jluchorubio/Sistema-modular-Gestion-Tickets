import {
  IsUUID,
  IsOptional,
  IsInt,
  Min,
  IsArray,
  IsIn,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const TECHNICIAN_TYPES = ['generalist', 'specialist', 'both'] as const;

export class AddSkillDto {
  @ApiProperty({ description: 'ID del módulo' })
  @IsUUID()
  module_id: string;

  @ApiPropertyOptional({ enum: TECHNICIAN_TYPES, default: 'generalist',
    description: 'Tipo de técnico: generalist (cualquier categoría), specialist (solo sus categorías), both' })
  @IsOptional()
  @IsIn(TECHNICIAN_TYPES)
  technician_type?: 'generalist' | 'specialist' | 'both';

  @ApiPropertyOptional({ minimum: 1, description: 'Máximo tickets por día. null = sin límite.' })
  @IsOptional()
  @IsInt()
  @Min(1)
  max_daily_tickets?: number;

  @ApiPropertyOptional({ type: [String], description: 'IDs de categorías habilitadas (para technician_type specialist/both)' })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  category_ids?: string[];
}
