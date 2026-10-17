import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ClientStatus, CommunicationType, ItemPriority, RequirementStatus } from '@prisma/client';
const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
export class PageQuery {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(200) q?: string;
  @IsOptional() @IsEnum({ newest: 'newest', oldest: 'oldest' }) sort: 'newest' | 'oldest' =
    'newest';
}
export class ClientQuery extends PageQuery {
  @IsOptional() @IsEnum(ClientStatus) status?: ClientStatus;
}
export class RequirementQuery extends PageQuery {
  @IsOptional() @IsEnum(RequirementStatus) status?: RequirementStatus;
}
export class CommunicationQuery extends PageQuery {
  @IsOptional() @IsEnum(CommunicationType) type?: CommunicationType;
  @IsOptional() @IsDateString({ strict: true }) from?: string;
  @IsOptional() @IsDateString({ strict: true }) to?: string;
}
export class FileQuery extends PageQuery {
  @IsOptional()
  @Transform(({ value }) => (value === 'true' ? true : value === 'false' ? false : value))
  @IsBoolean()
  includeArchived = false;
  @IsOptional() @IsUUID() requirementId?: string;
}
export class ExportQuery {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) version?: number;
}
export class CreateClientDto {
  @Transform(trim) @IsString() @Length(1, 160) name: string;
  @Transform(trim) @IsString() @Length(1, 160) company: string;
  @Transform(trim) @IsString() @Length(1, 160) contactName: string;
  @IsOptional() @Transform(trim) @IsEmail() @MaxLength(254) email?: string | null;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(50) phone?: string | null;
  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true, disallow_auth: true })
  @MaxLength(2000)
  website?: string | null;
}
export class UpdateClientDto extends CreateClientDto {
  @IsOptional() @IsEnum(ClientStatus) status?: ClientStatus;
}
export class RequirementItemDto {
  @Transform(trim) @IsString() @Length(1, 160) title: string;
  @IsString() @MaxLength(4000) description = '';
  @IsString() @MaxLength(80) category = '';
  @IsEnum(ItemPriority) priority: ItemPriority = ItemPriority.MEDIUM;
  @IsString() @MaxLength(2000) notes = '';
}
export class RequirementContentDto {
  @Transform(trim) @IsString() @Length(1, 180) title: string;
  @Transform(trim) @IsString() @Length(1, 8000) objective: string;
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @Length(1, 100, { each: true })
  services: string[] = [];
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => RequirementItemDto)
  items: RequirementItemDto[];
  @IsString() @MaxLength(4000) designPreferences = '';
  @IsArray()
  @ArrayMaxSize(30)
  @IsUrl(
    { protocols: ['http', 'https'], require_protocol: true, disallow_auth: true },
    { each: true },
  )
  @MaxLength(2000, { each: true })
  referenceLinks: string[] = [];
  @IsString() @MaxLength(4000) constraints = '';
  @IsString() @MaxLength(4000) assumptions = '';
  @IsString() @MaxLength(4000) internalRecommendations = '';
  @IsString() @MaxLength(4000) clientNotes = '';
  @IsString() @MaxLength(2000) timeline = '';
  @IsOptional() @IsDateString({ strict: true }) @Matches(/^\d{4}-\d{2}-\d{2}$/) targetDate?:
    | string
    | null;
  @IsOptional() @IsString() @Matches(/^(0|[1-9]\d{0,15})(\.\d{1,2})?$/) budgetMin?: string | null;
  @IsOptional() @IsString() @Matches(/^(0|[1-9]\d{0,15})(\.\d{1,2})?$/) budgetMax?: string | null;
  @IsOptional() @IsString() @Matches(/^[A-Z]{3}$/) currency?: string | null;
}
export class EditRequirementDto extends RequirementContentDto {
  @IsInt() @Min(1) @Max(2147483647) expectedVersion: number;
}
export class ChangeStatusDto {
  @IsEnum(RequirementStatus) status: RequirementStatus;
  @IsInt() @Min(1) @Max(2147483647) expectedVersion: number;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(2000) reason?: string;
}
export class CreateCommunicationDto {
  @IsEnum(CommunicationType) type: CommunicationType;
  @Transform(trim) @IsString() @Length(1, 180) subject: string;
  @Transform(trim) @IsString() @Length(1, 8000) summary: string;
  @IsDateString({ strict: true }) occurredAt: string;
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @Length(1, 160, { each: true })
  participants: string[] = [];
  @IsString() @MaxLength(4000) followUp = '';
  @IsOptional() @IsUUID() requirementId?: string;
}
export class CreateNoteDto {
  @Transform(trim) @IsString() @Length(1, 8000) body: string;
  @IsOptional() @IsUUID() requirementId?: string;
}
export class FileLinkDto {
  @Transform(trim) @IsString() @Length(1, 200) originalName: string;
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true, disallow_auth: true })
  @MaxLength(2000)
  referenceUrl: string;
  @IsOptional() @IsUUID() requirementId?: string;
}
export class FileUploadDto {
  @IsOptional() @IsUUID() requirementId?: string;
}
