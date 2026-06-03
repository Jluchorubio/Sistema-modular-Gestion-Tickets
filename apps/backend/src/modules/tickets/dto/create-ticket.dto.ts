import {
  IsString, IsUUID, IsOptional, IsIn, IsInt, Min, Max, MaxLength,
} from 'class-validator';

const PRIORITIES   = ['baja', 'media', 'alta', 'critica'] as const;
const URGENCIES    = ['baja', 'media', 'alta'] as const;
const IMPACTS      = ['bajo', 'medio', 'alto'] as const;
const REPROCESS    = [1, 2, 3, 4, 5] as const;

export class CreateTicketDto {
  @IsUUID()           module_id:      string;
  @IsUUID()           category_id:    string;
  @IsUUID()           environment_id: string;

  @IsString()
  @MaxLength(200)     title:          string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)    description?:   string;

  @IsOptional()
  @IsIn(PRIORITIES)   priority?:      string;

  @IsOptional()
  @IsIn(URGENCIES)    urgency?:       string;

  @IsOptional()
  @IsIn(IMPACTS)      impact?:        string;

  @IsOptional()
  @IsUUID()           damage_type_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)     custom_damage_description?: string;

  @IsOptional()
  @IsUUID()           asset_id?:      string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)             reprocess_count?: number;
}
