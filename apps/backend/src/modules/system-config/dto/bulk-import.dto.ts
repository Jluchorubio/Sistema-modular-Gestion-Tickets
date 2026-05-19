import { IsArray, IsString, IsOptional, IsEmail, ValidateNested, IsIn } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class BulkUserRowDto {
  @ApiProperty() @IsEmail()
  email: string;

  @ApiProperty() @IsString()
  first_name: string;

  @ApiProperty() @IsString()
  last_name: string;

  @ApiPropertyOptional() @IsString() @IsOptional()
  username?: string;

  @ApiPropertyOptional() @IsString() @IsOptional()
  phone?: string;

  @ApiPropertyOptional() @IsString() @IsOptional()
  job_title?: string;

  @ApiPropertyOptional() @IsString() @IsOptional()
  department?: string;

  @ApiPropertyOptional() @IsString() @IsOptional()
  primary_sede?: string;

  @ApiPropertyOptional() @IsString() @IsOptional()
  headquarters_name?: string;

  @ApiPropertyOptional() @IsString() @IsOptional()
  position_name?: string;

  @ApiPropertyOptional() @IsString() @IsOptional()
  global_role_name?: string;
}

export class BulkImportUsersDto {
  @ApiProperty({ type: [BulkUserRowDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BulkUserRowDto)
  users: BulkUserRowDto[];
}
