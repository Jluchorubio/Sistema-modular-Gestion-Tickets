import { IsString, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VerifyEmailOtpDto {
  @ApiProperty({ example: '847293', description: 'Código OTP de 6 dígitos recibido por email' })
  @IsString()
  @Length(6, 6)
  code: string;
}
