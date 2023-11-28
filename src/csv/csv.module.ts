import { Module } from '@nestjs/common';
import { CsvController } from './csv.controller';
import { CsvService } from './csv.service';
import { Csv, CsvSchema } from './csv.schema';
import { MongooseModule } from '@nestjs/mongoose';
import { Analisys, AnalisysSchema } from './csv.analisys.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Csv.name, schema: CsvSchema },
      { name: Analisys.name, schema: AnalisysSchema },
    ]),
  ],
  controllers: [CsvController],
  providers: [CsvService],
})
export class CsvModule {}
