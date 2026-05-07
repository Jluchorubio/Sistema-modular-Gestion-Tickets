import {
  IsEmail,
  IsString,
  MinLength,
  MaxLength,
  IsOptional,
  IsBoolean,
  IsUUID,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateUserDto {
  @ApiProperty({ example: 'Juan' })
  @IsString()
  @MaxLength(100)
  first_name: string;

  @ApiProperty({ example: 'García' })
  @IsString()
  @MaxLength(100)
  last_name: string;

  @ApiProperty({ example: 'juan.garcia@empresa.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Password123!' })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiPropertyOptional({ example: '+573001234567' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @ApiPropertyOptional({ example: 'juan_garcia' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  username?: string;

  @ApiPropertyOptional({ example: 'Calle 123 # 45-67, Bogotá' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ example: 'Técnico Senior' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  job_title?: string;

  @ApiPropertyOptional({ example: 'Soporte TI' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  department?: string;

  @ApiPropertyOptional({ example: 'Sede Norte' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  primary_sede?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  is_superadmin?: boolean;

  @ApiPropertyOptional({ description: 'UUID del rol global (config.global_roles)' })
  @IsOptional()
  @IsUUID()
  global_role_id?: string;
}
