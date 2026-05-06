import {
  IsUUID,
  IsOptional,
  IsString,
  IsInt,
  Min,
  Max,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AddSkillDto {
  @ApiProperty({ description: 'ID del módulo' })
  @IsUUID()
  module_id: string;

  @ApiPropertyOptional({ description: 'Slug de categoría de tickets' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  category_slug?: string;

  @ApiPropertyOptional({ description: 'Slug de ubicación' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  location_slug?: string;

  @ApiPropertyOptional({ description: 'Tipo de servicio' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  service_type?: string;

  @ApiPropertyOptional({ default: 10, minimum: 1, maximum: 100 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  max_concurrent?: number;

  @ApiPropertyOptional({ default: 0, description: 'Prioridad (mayor = preferido en asignación)' })
  @IsOptional()
  @IsInt()
  priority?: number;
}
