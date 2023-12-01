import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiProperty } from '@nestjs/swagger';
import * as mongoose from 'mongoose';
export type AnalisysDocument = Analisys & Document;

@Schema()
export class Analisys {
  _id: string;
  @Prop({
    type: mongoose.Schema.ObjectId,
    ref: Analisys.name,
  })
  csv: Analisys;

  @ApiProperty()
  @Prop({
    required: true,
    unique: true,
  })
  fileName: string;

  @ApiProperty()
  @Prop({ required: false })
  duplicateInFile: number;

  @ApiProperty()
  @Prop({ required: false })
  duplicateInMongo: number;

  @ApiProperty()
  @Prop({ required: true })
  duplicateInBase: number;

  @ApiProperty()
  @Prop({ required: true })
  badDataCounter: number;

  @ApiProperty()
  @Prop({ required: true })
  validDataCounter: number;
}

export const AnalisysSchema = SchemaFactory.createForClass(Analisys);
