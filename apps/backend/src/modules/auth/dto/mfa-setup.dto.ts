import { IsString, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class MfaEnableDto {
  @ApiProperty({ description: 'Código TOTP de 6 dígitos para confirmar enrolamiento' })
  @IsString()
  @Length(6, 6)
  code: string;
}
