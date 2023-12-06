import { Module } from '@nestjs/common';
import { CsvController } from './csv.controller';
import { CsvService } from './csv.service';
import { Csv, CsvSchema } from './main/csv.schema';
import { MongooseModule } from '@nestjs/mongoose';
import { Analisys, AnalisysSchema } from './analisys/csv.analisys.schema';
import { Basecsv, BasecsvSchema } from './base/base.csv.schema';
import {
  ApiResult,
  ApiResultSchema,
} from './carrier api/carrier.api.result.schema';
import { HttpModule } from '@nestjs/axios';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Csv.name, schema: CsvSchema },
      { name: Basecsv.name, schema: BasecsvSchema },
      { name: Analisys.name, schema: AnalisysSchema },
      { name: ApiResult.name, schema: ApiResultSchema },
    ]),
    HttpModule,
  ],
  controllers: [CsvController],
  providers: [CsvService],
})
export class CsvModule {}
