import { IsString, IsOptional, IsBoolean, IsArray, IsIn, IsNumber } from 'class-validator';

export class CreateKnowledgeArticleDto {
  @IsString() module_id:  string;
  @IsString() title:      string;

  @IsOptional() @IsString()  content?:      string;
  @IsOptional() @IsString()  category?:     string;
  @IsOptional() @IsArray()   tags?:         string[];
  @IsOptional() @IsString()  ticket_id?:    string;
  @IsOptional() @IsBoolean() is_published?: boolean;
  @IsOptional() @IsIn(['article', 'file']) doc_type?: string;
  @IsOptional() @IsString()  file_url?:     string;
  @IsOptional() @IsString()  file_name?:    string;
  @IsOptional() @IsNumber()  file_size?:    number;
  @IsOptional() @IsString()  file_mime?:    string;
}

export class UpdateKnowledgeArticleDto {
  @IsOptional() @IsString()  title?:        string;
  @IsOptional() @IsString()  content?:      string;
  @IsOptional() @IsString()  category?:     string;
  @IsOptional() @IsArray()   tags?:         string[];
  @IsOptional() @IsBoolean() is_published?: boolean;
}
