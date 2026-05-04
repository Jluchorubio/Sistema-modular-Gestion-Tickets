import { IsString, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VerifyTotpDto {
  @ApiProperty({ example: 'factor-uuid-here' })
  @IsString()
  factor_id: string;

  @ApiProperty({ example: '123456', description: '6-digit TOTP code from Google Authenticator' })
  @IsString()
  @Length(6, 6)
  code: string;
}
