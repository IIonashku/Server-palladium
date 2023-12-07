import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsObject } from 'class-validator';

export class NumberString {
  @ApiProperty()
  @IsArray()
  phoneNumber: string[];
}

export class LimitAndFilters {
  @ApiProperty()
  @IsObject()
  options: {
    limits: number;
    skips: number;
  };

  @ApiProperty()
  @IsObject()
  filters: {
    phoneNumber: string;
    carrier: string;
    listTag: string[];
    inBase: boolean | undefined;
  };
}
