import { IsOptional, IsInt, Min, IsArray, IsUUID, IsIn } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

const TECHNICIAN_TYPES = ['generalist', 'specialist', 'both'] as const;

export class UpdateSkillDto {
  @ApiPropertyOptional({ enum: TECHNICIAN_TYPES })
  @IsOptional()
  @IsIn(TECHNICIAN_TYPES)
  technician_type?: 'generalist' | 'specialist' | 'both';

  @ApiPropertyOptional({ minimum: 1, description: 'Máximo tickets por día. null = sin límite.' })
  @IsOptional()
  @IsInt()
  @Min(1)
  max_daily_tickets?: number;

  @ApiPropertyOptional({ type: [String], description: 'IDs de categorías a agregar' })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  category_ids_add?: string[];

  @ApiPropertyOptional({ type: [String], description: 'IDs de categorías a remover' })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  category_ids_remove?: string[];
}
