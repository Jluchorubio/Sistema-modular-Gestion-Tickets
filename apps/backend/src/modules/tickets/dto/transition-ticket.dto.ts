import { IsString, IsUUID, IsOptional, MaxLength } from 'class-validator';

export class TransitionTicketDto {
  @IsUUID()           transition_id: string;
  @IsOptional()
  @IsString()
  @MaxLength(1000)    reason?:       string;
}
