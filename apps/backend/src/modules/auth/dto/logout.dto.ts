import { IsString, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class LogoutDto {
  @ApiPropertyOptional({ description: 'Refresh token a revocar' })
  @IsString()
  @IsOptional()
  refresh_token?: string;
}
