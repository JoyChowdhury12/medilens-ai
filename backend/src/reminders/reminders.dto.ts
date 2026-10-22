import { IsBoolean, IsDateString, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateReminderDto {
  @IsUUID() profileId: string;
  @IsString() @MinLength(2) @MaxLength(200) title: string;
  @IsDateString() dueDate: string;
}

export class UpdateReminderDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(200) title?: string;
  @IsOptional() @IsDateString() dueDate?: string;
  @IsOptional() @IsBoolean() done?: boolean;
}
