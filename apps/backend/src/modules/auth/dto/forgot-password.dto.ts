import { IsEmail } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ForgotPasswordDto {
  @ApiProperty({ example: 'joselu.rubio2008@gmail.com' })
  @IsEmail()
  email: string;
}
