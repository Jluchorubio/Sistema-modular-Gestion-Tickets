import { IsString, IsIn, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ReviewRequestDto {
  @ApiProperty({ enum: ['under_review', 'approved', 'rejected'] })
  @IsIn(['under_review', 'approved', 'rejected'])
  status: string;

  @ApiPropertyOptional({ example: 'Acceso aprobado. Asignado al módulo Inventario con rol técnico.' })
  @IsString()
  @IsOptional()
  review_notes?: string;
}
