import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  InternalServerErrorException,
  Param,
  Post,
  Res,
  StreamableFile,
  UnsupportedMediaTypeException,
  UploadedFiles,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CsvService } from './csv.service';
import { AuthGuard } from 'src/auth/auth.guard';
import { ApiCsvFiles } from './api-file.fields.decorator';
import { join, resolve } from 'path';
import { Response } from 'express';
import { createReadStream } from 'fs';

@ApiTags('CSV controller')
@UseGuards(AuthGuard)
@ApiBearerAuth('JWT-auth')
@Controller('csv')
export class CsvController {
  constructor(private readonly csvService: CsvService) {}

  @ApiOperation({ summary: 'Get all' })
  @Get('/all/')
  async getData() {
    return await this.csvService.getAllData();
  }

  @Get('/count/')
  async getDataLenght() {
    return await this.csvService.getDataLenght();
  }

  @ApiOperation({ summary: 'Get data for front-end' })
  @Post('/data/')
  async getAllData(@Body() options: any) {
    if (!options.options.skips && !options.options.limits) {
      throw new BadRequestException('Options not correct');
    }

    const response = await this.csvService.getData(
      options.options.skips,
      options.options.limits,
    );
    return response;
  }

  @ApiOperation({ summary: 'Read data from existed csv file' })
  @Get('/read/:fileName')
  async readCsv(@Param('fileName') fileName: string) {
    try {
      const result = await this.csvService.readFile(fileName);
      return result;
    } catch (e) {
      console.log(e);
    }
  }

  @Post('upload')
  @ApiCsvFiles('files', true, 10)
  @ApiOperation({ summary: 'upload file' })
  async upload(@UploadedFiles() files: Express.Multer.File[]) {
    console.log(files);
    if (files === undefined || files === null || files.length === 0) {
      throw new BadRequestException('No file founded(file expected)');
    }
    for (let i = 0; i < files.length; i += 1) {
      if (files[i].mimetype !== 'text/csv') {
        throw new UnsupportedMediaTypeException('Csv file only');
      }
    }
    try {
      let counter = 0;
      const res = new Promise((resolve, reject) => {
        const result = [];
        files.forEach(async (file) => {
          const fileResult = this.csvService.readFile(file.filename);
          fileResult
            .then(async (innerResult) => {
              result.push([await innerResult, file.filename]);
              counter += 1;
              if (counter === files.length) {
                resolve(result);
              }
            })
            .catch((err) => {
              reject(err);
            });
        });
      });
      return await res;
    } catch {
      throw new InternalServerErrorException();
    }
  }

  @ApiOperation({ summary: 'Get file' })
  @Header('Content-Type', 'application/octet-stream')
  @Header('Content-Disposition', 'attachment; filename="Export_csv_file.csv"')
  @Get('/export/')
  async exportFile(@Res() res: Response) {
    const fileWritingResult = await this.csvService.exportDataToFile();
    if (fileWritingResult) {
      const file = createReadStream(
        join(process.cwd(), 'Export_csv_file.csv'),
      ).pipe(res);
      return;
    }
  }
}
