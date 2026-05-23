import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ example: 'joselu.rubio2008@gmail.com o nombre_usuario' })
  @IsString()
  email: string;

  @ApiProperty({ example: '123456789' })
  @IsString()
  @MinLength(6)
  password: string;
}
