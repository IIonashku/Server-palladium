import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiProperty } from '@nestjs/swagger';
import * as mongoose from 'mongoose';
import { type } from '../../types/csv.types';
export type UserDocument = ApiResult & Document;

@Schema({})
export class ApiResult {
  _id: string;
  @Prop({
    type: mongoose.Schema.ObjectId,
    ref: ApiResult.name,
  })
  basecsv: ApiResult;

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
  @Prop({ type: String, enum: type, required: false })
  type: type;
}

export const ApiResultSchema = SchemaFactory.createForClass(ApiResult);
