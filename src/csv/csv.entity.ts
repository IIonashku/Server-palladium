import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiProperty } from '@nestjs/swagger';
import * as mongoose from 'mongoose';
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
}

export const CsvSchema = SchemaFactory.createForClass(Csv);
