import { Prop, Schema } from '@nestjs/mongoose';
import { SchemaTypes, Types } from 'mongoose';

@Schema({ timestamps: true })
export class defaultEntity {
  @Prop({
    type: SchemaTypes.ObjectId,
  })
  _id: Types.ObjectId;

  @Prop({
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP(6)',
  })
  created_at: Date;

  @Prop({
    type: 'timestamp',

    default: () => 'CURRENT_TIMESTAMP(6)',
  })
  updated_at: Date;
}
