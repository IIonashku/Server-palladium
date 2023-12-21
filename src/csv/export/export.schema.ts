import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiProperty } from '@nestjs/swagger';
import * as mongoose from 'mongoose';
export type ExportDocument = Export & Document;

@Schema()
export class Export {
  _id: string;
  @Prop({
    type: mongoose.Schema.ObjectId,
    ref: Export.name,
  })
  csv: Export;

  @ApiProperty()
  @Prop({
    required: true,
    unique: true,
  })
  fileName: string;
  @ApiProperty()
  @Prop({ required: true })
  dataCounter: number;
}

export const ExportSchema = SchemaFactory.createForClass(Export);
