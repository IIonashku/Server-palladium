import { Module } from '@nestjs/common';
import { CsvController } from './csv.controller';
import { CsvService } from './csv.service';
import { Csv, CsvSchema } from './csv.entity';
import { MongooseModule } from '@nestjs/mongoose';

@Module({
  imports: [MongooseModule.forFeature([{ name: Csv.name, schema: CsvSchema }])],
  controllers: [CsvController],
  providers: [CsvService],
})
export class CsvModule {}
