import { IsString, IsOptional, MinLength, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CompleteProfileDto {
  @ApiProperty({ example: '+57 311 000 0000' })
  @IsString()
  @MinLength(7)
  phone: string;

  @ApiProperty({ example: 'Calle 123 # 45-67, Bogotá' })
  @IsString()
  @MinLength(5)
  address: string;

  @ApiProperty({ example: 'Sede Norte' })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  primary_sede: string;

  @ApiProperty({ example: 'Soporte TI' })
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  department: string;

  @ApiProperty({ example: 'Técnico Senior' })
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  job_title: string;

  @ApiPropertyOptional({ example: 'juan_perez' })
  @IsString()
  @IsOptional()
  @MinLength(3)
  @MaxLength(100)
  username?: string;

  @ApiPropertyOptional({ example: '+57' })
  @IsString()
  @IsOptional()
  @MaxLength(10)
  phone_prefix?: string;

  @ApiPropertyOptional({ example: 'Colombia' })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  country?: string;

  @ApiPropertyOptional({ example: 'Cundinamarca' })
  @IsString()
  @IsOptional()
  @MaxLength(150)
  state_province?: string;

  @ApiPropertyOptional({ example: 'Bogotá' })
  @IsString()
  @IsOptional()
  @MaxLength(150)
  city?: string;

  @ApiPropertyOptional({ description: 'UUID del nodo org (área/departamento) al que pertenece el usuario' })
  @IsString()
  @IsOptional()
  org_node_id?: string;

  @ApiPropertyOptional({ description: 'UUID del nodo cargo (position) del usuario' })
  @IsString()
  @IsOptional()
  position_node_id?: string;
}
