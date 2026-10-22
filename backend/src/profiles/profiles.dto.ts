import { IsDateString, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateProfileDto {
  @IsString() @MinLength(1) @MaxLength(80) name: string;
  @IsOptional() @IsString() @MaxLength(30) relation?: string;
  @IsOptional() @IsIn(['male', 'female']) sex?: 'male' | 'female';
  @IsOptional() @IsDateString() birthDate?: string;
}

export class UpdateProfileDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(80) name?: string;
  @IsOptional() @IsString() @MaxLength(30) relation?: string;
  @IsOptional() @IsIn(['male', 'female']) sex?: 'male' | 'female';
  @IsOptional() @IsDateString() birthDate?: string;
}
