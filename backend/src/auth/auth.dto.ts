import { IsEmail, IsIn, IsOptional, IsString, Matches, MaxLength, MinLength, ValidateIf } from 'class-validator';

export class RegisterDto {
  @IsString() @MinLength(2) @MaxLength(80) name: string;
  @IsEmail() email: string;
  @IsString() @MinLength(8) @MaxLength(100) password: string;
}

export class LoginDto {
  @IsEmail() email: string;
  @IsString() password: string;
}

export class UpdateMeDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(80) name?: string;
  @IsOptional() @IsString() @MaxLength(30) phone?: string;
  @IsOptional() @IsIn(['', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']) bloodGroup?: string;
  @IsOptional() @IsString() @MaxLength(80) city?: string;
  @IsOptional() @IsString() @MaxLength(80) emergencyName?: string;
  @IsOptional() @IsString() @MaxLength(30) emergencyPhone?: string;
  // small data-URL picture (the website shrinks it to ~256px first); null removes it
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(90_000)
  @Matches(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/, { message: 'Picture must be a JPEG, PNG or WebP image.' })
  avatar?: string | null;
}

export class ChangePasswordDto {
  @IsOptional() @IsString() currentPassword?: string;
  @IsString() @MinLength(8) @MaxLength(100) newPassword: string;
}

export class DeleteAccountDto {
  @IsOptional() @IsString() password?: string;
}

export class GoogleDto {
  @IsString() @MaxLength(4000) credential: string;
}
