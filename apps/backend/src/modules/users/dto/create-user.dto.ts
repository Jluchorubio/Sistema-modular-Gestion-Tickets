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

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  is_superadmin?: boolean;

  @ApiPropertyOptional({ description: 'UUID del rol global (config.global_roles)' })
  @IsOptional()
  @IsUUID()
  global_role_id?: string;
}
