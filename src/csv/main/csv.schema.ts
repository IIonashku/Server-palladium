import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiProperty } from '@nestjs/swagger';
import * as mongoose from 'mongoose';
import { deviceType } from '../../types/csv.types';
export type UserDocument = Csv & Document;

@Schema()
export class Csv {
  _id: string;
  @Prop({
    type: mongoose.Schema.ObjectId,
    ref: Csv.name,
  })
  csv: Csv;

  @ApiProperty()
  @Prop({
    required: true,
    unique: true,
  })
  phoneNumber: string;

  @ApiProperty()
  @Prop({ required: false })
  firstName: string;

  @ApiProperty()
  @Prop({ required: false })
  lastName: string;

  @ApiProperty()
  @Prop({ required: true })
  listTag: string[];

  @ApiProperty()
  @Prop({ required: false })
  carrier: string;

  @ApiProperty()
  @Prop({ type: String, enum: deviceType, required: false })
  type: deviceType;
  @ApiProperty()
  @Prop({ type: Boolean, required: false })
  inBase: boolean;
}

export const CsvSchema = SchemaFactory.createForClass(Csv);

CsvSchema.index({ listTag: 1 });
CsvSchema.index({ type: 1 });
CsvSchema.index({ carrier: 1 });
CsvSchema.index({ inBase: 1 });
