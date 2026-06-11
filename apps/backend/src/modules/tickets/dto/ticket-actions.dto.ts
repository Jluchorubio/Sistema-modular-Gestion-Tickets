import { IsString, IsOptional, MinLength, MaxLength, IsIn, IsNumber, IsBoolean, Min, Max } from 'class-validator';

const ALLOWED_MIME_TYPES = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
  'application/pdf',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain', 'text/csv',
  'application/zip', 'application/x-zip-compressed',
];

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

export class AddCommentDto {
  @IsString()
  @MinLength(1, { message: 'El comentario no puede estar vacío.' })
  @MaxLength(10000, { message: 'El comentario no puede superar 10,000 caracteres.' })
  content: string;

  @IsOptional()
  @IsIn(['comment', 'internal', 'system'])
  comment_type?: string;
}

export class AddAttachmentDto {
  @IsString() @MaxLength(255) original_name: string;
  @IsString() @MaxLength(255) stored_name:   string;
  @IsString() @IsIn(ALLOWED_MIME_TYPES, { message: 'Tipo de archivo no permitido.' })
  mime_type: string;
  @IsNumber() @Min(1) @Max(MAX_FILE_SIZE, { message: 'El archivo supera el límite de 50 MB.' })
  file_size: number;
  @IsString() @MaxLength(1000) file_url: string;
}

export class ApproveTicketDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  signature?: string;
}

export class RejectTicketDto {
  @IsString()
  @MinLength(10, { message: 'El motivo de rechazo debe tener al menos 10 caracteres.' })
  @MaxLength(2000)
  reason: string;
}

export class AddAssignmentDto {
  @IsString() user_id: string;
  @IsIn(['owner', 'collaborator', 'observer'], { message: 'Rol inválido.' })
  role: string;
}

export class AddRelationDto {
  @IsString() target_ticket_id: string;
  @IsIn(['duplicado', 'relacionado', 'bloquea', 'bloqueado_por'], { message: 'Tipo de relación inválido.' })
  relation_type: string;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}

export class RateTicketDto {
  @IsNumber() @Min(1) @Max(5) score_overall:              number;
  @IsOptional() @IsNumber() @Min(1) @Max(5) score_attention?:       number;
  @IsOptional() @IsNumber() @Min(1) @Max(5) score_clarity?:         number;
  @IsOptional() @IsNumber() @Min(1) @Max(5) score_response_time?:   number;
  @IsOptional() @IsNumber() @Min(1) @Max(5) score_quality?:         number;
  @IsOptional() @IsString() @MaxLength(100)  service_label?:        string;
  @IsOptional() @IsString() @MaxLength(2000) comment?:              string;
  @IsOptional() @IsBoolean() would_recommend?:          boolean;
  @IsOptional() @IsBoolean() resolved_on_first_attempt?: boolean;
}
