import { IsString, IsIn, IsOptional, IsInt, IsBoolean, IsEmail, Min, MinLength, MaxLength, IsNumber } from 'class-validator';
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
}

export class UpdateDamageTypeDto {
  @ApiPropertyOptional() @IsBoolean() @IsOptional()
  is_active?: boolean;

  @ApiPropertyOptional({ minimum: 1, maximum: 10 }) @IsInt() @Min(1) @IsOptional()
  weight?: number;

  @ApiPropertyOptional() @IsString() @IsOptional() @MinLength(2) @MaxLength(150)
  label?: string;
}

export class UpsertBusinessHourDto {
  @ApiPropertyOptional({ description: 'NULL = global' }) @IsString() @IsOptional()
  module_id?: string;

  @ApiProperty({ minimum: 0, maximum: 6, description: '0=Dom, 1=Lun … 6=Sáb' })
  @IsInt() @Min(0) @IsNumber({}, { message: 'day_of_week requerido' })
  day_of_week: number;

  @ApiProperty({ example: '07:00' }) @IsString()
  start_time: string;

  @ApiProperty({ example: '17:00' }) @IsString()
  end_time: string;

  @ApiPropertyOptional() @IsBoolean() @IsOptional()
  is_active?: boolean;
}

export class CreateHolidayDto {
  @ApiPropertyOptional({ description: 'NULL = global' }) @IsString() @IsOptional()
  module_id?: string;

  @ApiProperty({ example: '2025-12-25' }) @IsString()
  holiday_date: string;

  @ApiProperty({ example: 'Navidad' }) @IsString() @MinLength(2) @MaxLength(150)
  name: string;
}

const SLA_CONDITION_FIELDS = ['priority','urgency','impact','damage_type_id','category_id','environment_id'] as const;
const SLA_OPERATORS        = ['=','!=','IN','>','<','>=','<='] as const;
const PRIORITY_RESULT      = ['baja','media','alta','critica'] as const;

export class CreateTicketSlaRuleDto {
  @ApiProperty() @IsString() @MinLength(2) @MaxLength(150)
  name: string;

  @ApiProperty({ enum: PRIORITY_RESULT }) @IsIn(PRIORITY_RESULT as unknown as string[])
  priority_result: string;

  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1)
  hours_to_resolve: number;

  @ApiPropertyOptional({ minimum: 0 }) @IsInt() @Min(0) @IsOptional()
  sort_order?: number;
}

export class UpdateTicketSlaRuleDto {
  @ApiPropertyOptional() @IsString() @MinLength(2) @MaxLength(150) @IsOptional()
  name?: string;

  @ApiPropertyOptional({ enum: PRIORITY_RESULT }) @IsIn(PRIORITY_RESULT as unknown as string[]) @IsOptional()
  priority_result?: string;

  @ApiPropertyOptional({ minimum: 1 }) @IsInt() @Min(1) @IsOptional()
  hours_to_resolve?: number;

  @ApiPropertyOptional() @IsBoolean() @IsOptional()
  is_active?: boolean;

  @ApiPropertyOptional({ minimum: 0 }) @IsInt() @Min(0) @IsOptional()
  sort_order?: number;
}

export class CreateTicketSlaConditionDto {
  @ApiProperty({ enum: SLA_CONDITION_FIELDS }) @IsIn(SLA_CONDITION_FIELDS as unknown as string[])
  field: string;

  @ApiProperty({ enum: SLA_OPERATORS }) @IsIn(SLA_OPERATORS as unknown as string[])
  operator: string;

  @ApiProperty({ example: 'critica' }) @IsString() @MinLength(1) @MaxLength(500)
  value: string;

  @ApiPropertyOptional({ example: 1 }) @IsInt() @Min(1) @IsOptional()
  logical_group?: number;
}

export class UpdatePriorityFormulaDto {
  @ApiPropertyOptional({ minimum: 0, maximum: 1 }) @IsNumber() @IsOptional()
  w_cargo?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 1 }) @IsNumber() @IsOptional()
  w_nodo?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 1 }) @IsNumber() @IsOptional()
  w_daño?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 15 }) @IsNumber() @IsOptional()
  threshold_critica?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 15 }) @IsNumber() @IsOptional()
  threshold_alta?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 15 }) @IsNumber() @IsOptional()
  threshold_media?: number;

  @ApiPropertyOptional() @IsString() @IsOptional()
  description?: string;
}

export class PreviewPriorityDto {
  @ApiProperty({ minimum: 1, maximum: 10 }) @IsNumber()
  peso_cargo: number;

  @ApiProperty({ minimum: 1, maximum: 10 }) @IsNumber()
  peso_nodo: number;

  @ApiProperty({ minimum: 1, maximum: 10 }) @IsNumber()
  peso_daño: number;

  @ApiPropertyOptional({ enum: ['urgente','alta','media','baja'] }) @IsString() @IsOptional()
  urgency?: string;

  @ApiPropertyOptional({ enum: ['critico','alto','medio','bajo'] }) @IsString() @IsOptional()
  impact?: string;
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
