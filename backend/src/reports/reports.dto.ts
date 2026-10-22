import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsDateString, IsNumber, IsOptional, IsString, MaxLength, ValidateNested,
} from 'class-validator';

export class ConfirmedTestDto {
  @IsString() @MaxLength(40) code: string;
  @IsNumber() value: number;
  @IsOptional() @IsNumber() printedLow?: number | null;
  @IsOptional() @IsNumber() printedHigh?: number | null;
}

export class ConfirmReportDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(80) @ValidateNested({ each: true }) @Type(() => ConfirmedTestDto)
  tests: ConfirmedTestDto[];
  @IsOptional() @IsDateString() reportDate?: string;
  @IsOptional() @IsString() @MaxLength(120) labName?: string;
}
