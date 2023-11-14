import { ApiProperty } from '@nestjs/swagger';
import { Role } from './roles';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import * as mongoose from 'mongoose';

export type UserDocument = User & Document;

@Schema()
export class User {
  _id: string;

  @Prop({
    type: mongoose.Schema.ObjectId,
    ref: User.name,
  })
  user: User;

  @ApiProperty()
  @Prop({
    required: true,
    unique: true,
    name: 'username',
  })
  username: string;

  @Prop({
    required: true,
    name: 'password',
  })
  password: string;

  @ApiProperty()
  @Prop({
    name: 'jwt',
  })
  jwt: string;
  @ApiProperty()
  @Prop({
    name: 'refresh',
  })
  refresh: string;

  @ApiProperty({ default: 'USER' })
  @Prop({
    type: String,
    enum: Role,
  })
  role: string;
}

export const UserSchema = SchemaFactory.createForClass(User);
