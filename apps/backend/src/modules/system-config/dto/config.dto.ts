import { IsString, IsIn, IsOptional, IsInt, IsBoolean, IsEmail, IsUrl, Min, MinLength, MaxLength, IsNumber } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const PRIORITIES = ['baja', 'media', 'alta', 'critica'] as const;

export class UpdateSlaRuleDto {
  @ApiProperty({ minimum: 1 })
  @IsInt() @Min(1)
  hours_to_resolve: number;

  @ApiPropertyOptional({ minimum: 1 })
  @IsInt() @Min(1) @IsOptional()
  hours_to_first_response?: number;
}

export class UpdateCompanyDto {
  @ApiPropertyOptional() @IsString() @IsOptional() @MinLength(2) @MaxLength(200)
  name?: string;

  @ApiPropertyOptional() @IsString() @IsOptional() @MaxLength(100)
  timezone?: string;

  @ApiPropertyOptional() @IsString() @IsOptional() @MaxLength(10)
  language?: string;

  @ApiPropertyOptional() @IsString() @IsOptional()
  logo_url?: string;

  @ApiPropertyOptional() @IsString() @IsOptional() @MaxLength(20)
  primary_color?: string;

  @ApiPropertyOptional() @IsString() @IsOptional()
  website?: string;

  @ApiPropertyOptional() @IsEmail() @IsOptional()
  contact_email?: string;

  @ApiPropertyOptional() @IsString() @IsOptional() @MaxLength(30)
  contact_phone?: string;

  @ApiPropertyOptional() @IsString() @IsOptional() @MaxLength(50)
  fiscal_id?: string;

  @ApiPropertyOptional() @IsString() @IsOptional() @MaxLength(100)
  industry?: string;

  @ApiPropertyOptional() @IsInt() @IsOptional() @Min(1)
  employee_count?: number;
}

export class UpdateRequestTypeDto {
  @ApiPropertyOptional() @IsString() @IsOptional() @MinLength(2) @MaxLength(100)
  label?: string;

  @ApiPropertyOptional() @IsString() @IsOptional()
  description?: string;

  @ApiPropertyOptional() @IsBoolean() @IsOptional()
  is_active?: boolean;

  @ApiPropertyOptional() @IsBoolean() @IsOptional()
  requires_module?: boolean;

  @ApiPropertyOptional() @IsBoolean() @IsOptional()
  allows_manual_priority?: boolean;

  @ApiPropertyOptional() @IsInt() @IsOptional() @Min(0)
  sort_order?: number;
}
