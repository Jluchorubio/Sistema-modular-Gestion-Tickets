import { IsString, IsOptional, IsInt, IsEmail, IsUrl, MinLength, MaxLength, Min, Max } from 'class-validator';
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
