import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ResetPasswordDto {
  @ApiProperty({ description: 'Token recibido por email' })
  @IsString()
  token: string;

  @ApiProperty({ description: 'Nueva contraseña (mínimo 8 caracteres)' })
  @IsString()
  @MinLength(8)
  new_password: string;
}
