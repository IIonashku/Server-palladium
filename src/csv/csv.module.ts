import { Module } from '@nestjs/common';
import { CsvController } from './csv.controller';
import { CsvService } from './csv.service';
import { Csv, CsvSchema } from './main/csv.schema';
import { MongooseModule } from '@nestjs/mongoose';
import { Analisys, AnalisysSchema } from './analisys/csv.analisys.schema';
import { Basecsv, BasecsvSchema } from './base/base.csv.schema';
import { HttpModule } from '@nestjs/axios';
import { Export, ExportSchema } from './export/export.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Csv.name, schema: CsvSchema },
      { name: Basecsv.name, schema: BasecsvSchema },
      { name: Analisys.name, schema: AnalisysSchema },
      { name: Export.name, schema: ExportSchema },
    ]),
    HttpModule,
  ],
  controllers: [CsvController],
  providers: [CsvService],
})
export class CsvModule {}
