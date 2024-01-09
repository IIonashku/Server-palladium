import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiProperty } from '@nestjs/swagger';
import * as mongoose from 'mongoose';
import { deviceType } from '../../types/csv.types';
export type UserDocument = Basecsv & Document;

@Schema({})
export class Basecsv {
  _id: string;
  @Prop({
    type: mongoose.Schema.ObjectId,
    ref: Basecsv.name,
  })
  basecsv: Basecsv;

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
  @Prop({ required: false })
  carrier: string;

  @ApiProperty()
  @Prop({ type: String, enum: deviceType, required: false })
  type: deviceType;
}

export const BasecsvSchema = SchemaFactory.createForClass(Basecsv);
