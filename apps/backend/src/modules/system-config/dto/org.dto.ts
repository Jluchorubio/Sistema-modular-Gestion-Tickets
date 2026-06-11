import { IsString, IsOptional, IsInt, IsEmail, IsBoolean, MinLength, MaxLength, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateHeadquarterDto {
  @ApiProperty() @IsString() @MinLength(2) @MaxLength(200)
  name: string;

  @ApiPropertyOptional() @IsString() @IsOptional()
  address?: string;

  @ApiPropertyOptional() @IsString() @IsOptional() @MaxLength(100)
  city?: string;

  @ApiPropertyOptional() @IsString() @IsOptional() @MaxLength(100)
  country?: string;

  @ApiPropertyOptional() @IsString() @IsOptional() @MaxLength(30)
  phone?: string;

  @ApiPropertyOptional() @IsEmail() @IsOptional()
  email?: string;
}

export class UpdateHeadquarterDto {
  @ApiPropertyOptional() @IsString() @IsOptional() @MinLength(2) @MaxLength(200)
  name?: string;

  @ApiPropertyOptional() @IsString() @IsOptional()
  address?: string;

  @ApiPropertyOptional() @IsString() @IsOptional() @MaxLength(100)
  city?: string;

  @ApiPropertyOptional() @IsString() @IsOptional() @MaxLength(100)
  country?: string;

  @ApiPropertyOptional() @IsString() @IsOptional() @MaxLength(30)
  phone?: string;

  @ApiPropertyOptional() @IsEmail() @IsOptional()
  email?: string;
}

export class CreateDepartmentDto {
  @ApiProperty() @IsString() @MinLength(2) @MaxLength(150)
  name: string;

  @ApiPropertyOptional() @IsString() @IsOptional()
  description?: string;
}

export class CreateAreaDto {
  @ApiProperty() @IsString() @MinLength(2) @MaxLength(150)
  name: string;

  @ApiPropertyOptional() @IsString() @IsOptional()
  description?: string;

  @ApiPropertyOptional() @IsString() @IsOptional()
  department_id?: string;
}

export class CreatePositionDto {
  @ApiProperty() @IsString() @MinLength(2) @MaxLength(150)
  name: string;

  @ApiProperty({ minimum: 1, maximum: 10, example: 1 })
  @IsInt() @Min(1) @Max(10)
  level: number;

  @ApiPropertyOptional() @IsString() @IsOptional()
  description?: string;
}

/* ── Dynamic org nodes ─────────────────────────────────────────────────── */

export class CreateStructureTypeDto {
  @ApiProperty() @IsString() @MinLength(2) @MaxLength(100)
  name: string;

  @ApiProperty() @IsString() @MinLength(2) @MaxLength(50)
  slug: string;

  @ApiPropertyOptional() @IsString() @IsOptional()
  description?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 10 }) @IsInt() @Min(1) @Max(10) @IsOptional()
  weight?: number;

  @ApiPropertyOptional() @IsString() @IsOptional()
  parent_type_id?: string;

  @ApiPropertyOptional() @IsBoolean() @IsOptional()
  allows_users?: boolean;

  @ApiPropertyOptional({ minimum: 0 }) @IsInt() @Min(0) @IsOptional()
  sort_order?: number;

  @ApiPropertyOptional() @IsString() @IsOptional() @MaxLength(50)
  icon?: string;

  @ApiPropertyOptional() @IsString() @IsOptional() @MaxLength(20)
  color?: string;
}

export class UpdateStructureTypeDto {
  @ApiPropertyOptional() @IsString() @MinLength(2) @MaxLength(100) @IsOptional()
  name?: string;

  @ApiPropertyOptional() @IsString() @IsOptional()
  description?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 10 }) @IsInt() @Min(1) @Max(10) @IsOptional()
  weight?: number;

  @ApiPropertyOptional() @IsString() @IsOptional()
  parent_type_id?: string;

  @ApiPropertyOptional() @IsBoolean() @IsOptional()
  allows_users?: boolean;

  @ApiPropertyOptional() @IsBoolean() @IsOptional()
  is_active?: boolean;

  @ApiPropertyOptional() @IsString() @IsOptional() @MaxLength(50)
  icon?: string;

  @ApiPropertyOptional() @IsString() @IsOptional() @MaxLength(20)
  color?: string;

  @ApiPropertyOptional({ minimum: 0 }) @IsInt() @Min(0) @IsOptional()
  sort_order?: number;
}

export class CreateOrgNodeDto {
  @ApiProperty() @IsString()
  type_id: string;

  @ApiPropertyOptional() @IsString() @IsOptional()
  parent_id?: string;

  @ApiProperty() @IsString() @MinLength(2) @MaxLength(200)
  name: string;

  @ApiPropertyOptional() @IsString() @IsOptional() @MaxLength(50)
  code?: string;

  @ApiPropertyOptional() @IsString() @IsOptional()
  description?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 10 }) @IsInt() @Min(1) @Max(10) @IsOptional()
  weight?: number;

  @ApiPropertyOptional() @IsString() @IsOptional()
  address?: string;

  @ApiPropertyOptional() @IsString() @IsOptional() @MaxLength(100)
  city?: string;

  @ApiPropertyOptional() @IsString() @IsOptional() @MaxLength(100)
  country?: string;

  @ApiPropertyOptional() @IsString() @IsOptional() @MaxLength(30)
  phone?: string;

  @ApiPropertyOptional() @IsEmail() @IsOptional()
  email?: string;

  @ApiPropertyOptional({ minimum: 0 }) @IsInt() @Min(0) @IsOptional()
  sort_order?: number;
}

export class UpdateOrgNodeDto {
  @ApiPropertyOptional() @IsString() @IsOptional()
  parent_id?: string;

  @ApiPropertyOptional() @IsString() @MinLength(2) @MaxLength(200) @IsOptional()
  name?: string;

  @ApiPropertyOptional() @IsString() @IsOptional() @MaxLength(50)
  code?: string;

  @ApiPropertyOptional() @IsString() @IsOptional()
  description?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 10 }) @IsInt() @Min(1) @Max(10) @IsOptional()
  weight?: number;

  @ApiPropertyOptional() @IsString() @IsOptional()
  address?: string;

  @ApiPropertyOptional() @IsString() @IsOptional() @MaxLength(100)
  city?: string;

  @ApiPropertyOptional() @IsString() @IsOptional() @MaxLength(100)
  country?: string;

  @ApiPropertyOptional() @IsString() @IsOptional() @MaxLength(30)
  phone?: string;

  @ApiPropertyOptional() @IsEmail() @IsOptional()
  email?: string;

  @ApiPropertyOptional() @IsBoolean() @IsOptional()
  is_active?: boolean;

  @ApiPropertyOptional({ minimum: 0 }) @IsInt() @Min(0) @IsOptional()
  sort_order?: number;
}
