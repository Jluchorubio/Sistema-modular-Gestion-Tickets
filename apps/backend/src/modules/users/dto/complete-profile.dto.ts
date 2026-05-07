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
}
