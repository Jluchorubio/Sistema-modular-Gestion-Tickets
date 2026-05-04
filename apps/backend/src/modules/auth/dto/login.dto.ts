import { IsEmail, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ example: 'joselu.rubio2008@gmail.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: '123456789' })
  @IsString()
  @MinLength(6)
  password: string;
}
