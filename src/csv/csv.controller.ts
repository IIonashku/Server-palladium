import {
  BadRequestException,
  Body,
  Controller,
  Get,
  InternalServerErrorException,
  Param,
  Post,
  UnsupportedMediaTypeException,
  UploadedFiles,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CsvService } from './csv.service';
import { AuthGuard } from 'src/auth/auth.guard';
import { ApiCsvFiles } from './api-file.fields.decorator';
import { Public } from 'src/auth/public.declaration';
let readingStatus: string = 'Not reading';
@ApiTags('CSV controller')
@UseGuards(AuthGuard)
@ApiBearerAuth('JWT-auth')
@Controller('csv')
export class CsvController {
  constructor(private readonly csvService: CsvService) {}

  @Post('/count/')
  async getCsvDataLenght(@Body() filters?: any) {
    return await this.csvService.getDataLenght(filters);
  }

  @ApiOperation({ summary: 'Get data for front-end' })
  @Post('/data/')
  async getCsvData(@Body() options: any, @Body() filters: any) {
    if (options.options.skips < 0 && options.options.limits < 0) {
      throw new BadRequestException('Options not correct');
    }

    const response = await this.csvService.getData(
      options.options.skips,
      options.options.limits,
      filters,
    );
    return response;
  }

  @Post('/analisys/count/')
  async getAnalisysDataLenght() {
    return await this.csvService.getAnalisysDataLenght();
  }

  @ApiOperation({ summary: 'Get data for front-end' })
  @Post('/analisys/data/')
  async getAnalisysData(@Body() options: any) {
    if (options.options.skips < 0 && options.options.limits < 0) {
      throw new BadRequestException('Options not correct');
    }

    const response = await this.csvService.getAnalisysData(
      options.options.skips,
      options.options.limits,
    );
    return response;
  }

  @ApiOperation({ summary: 'Get all List tag for front-end' })
  @Post('/analisys/tags')
  async getListTags() {
    const response = await this.csvService.getListTags();
    return response;
  }

  @Public()
  @Get('check/reading')
  isReading() {
    const data = this.csvService.numberOfUploadedData;
    const lines = this.csvService.numberOfData;
    return {
      status: readingStatus,
      uploadedData: data,
      lines: lines,
    };
  }

  @ApiOperation({ summary: 'Read data from existed csv file in server' })
  @Get('/read/:fileName')
  async readCsv(@Param('fileName') fileName: string) {
    try {
      const result = await this.csvService.readFile(fileName);
      return result;
    } catch (e) {
      throw new InternalServerErrorException();
    }
  }

  @Post('upload')
  @ApiCsvFiles('files', true, 10)
  @ApiOperation({ summary: 'upload file' })
  async upload(@UploadedFiles() files: Express.Multer.File[]) {
    if (files === undefined || files === null || files.length === 0) {
      throw new BadRequestException('No file founded(file expected)');
    }
    for (let i = 0; i < files.length; i += 1) {
      if (files[i].mimetype !== 'text/csv') {
        throw new UnsupportedMediaTypeException('Csv file only');
      }
    }
    readingStatus = 'Reading';
    try {
      let counter = 0;
      const res = new Promise((resolve, reject) => {
        const result = [];
        files.forEach(async (file) => {
          const fileResult = this.csvService.readFile(file.filename);
          fileResult
            .then(async (innerResult) => {
              result.push([await innerResult, file.filename]);
              try {
                await this.csvService.saveAnalisys({
                  fileName: file.filename,
                  badDataCounter: Number(innerResult.badDataCounter),
                  validDataCounter: Number(innerResult.validDataCounter),
                  duplicateInFile: innerResult.duplicateInFile
                    ? Number(innerResult.duplicateInFile)
                    : 0,
                  duplicateInMongo: innerResult.duplicateInMongo
                    ? Number(innerResult.duplicateInMongo)
                    : 0,
                });
              } catch {
                throw new BadRequestException();
              }
              counter += 1;
              if (counter === files.length) {
                readingStatus = 'Uploaded';
                this.csvService.numberOfData = 0;
                this.csvService.numberOfUploadedData = 0;
                resolve(result);
              }
            })
            .catch((err) => {
              reject(err);
            });
        });
      });
      return { result: await res };
    } catch (e) {
      console.log(e);
      readingStatus = 'ERROR';
      throw new InternalServerErrorException();
    } finally {
      this.csvService.numberOfData = 0;
    }
  }

  @Post('update')
  @ApiCsvFiles('files', true, 10)
  @ApiOperation({ summary: 'upload file' })
  async update(@UploadedFiles() files: Express.Multer.File[]) {
    if (files === undefined || files === null || files.length === 0) {
      throw new BadRequestException('No file founded(file expected)');
    }
    for (let i = 0; i < files.length; i += 1) {
      if (files[i].mimetype !== 'text/csv') {
        throw new UnsupportedMediaTypeException('Csv file only');
      }
    }
    readingStatus = 'Reading';
    try {
      let counter = 0;
      const res = new Promise((resolve, reject) => {
        const result = [];
        files.forEach(async (file) => {
          const fileResult = this.csvService.updateData(file.filename);
          fileResult
            .then(async (innerResult) => {
              result.push([await innerResult, file.filename + '.update']);
              try {
                await this.csvService.saveAnalisys({
                  fileName: file.filename + '.update',
                  badDataCounter: innerResult.badDataCounter,
                  validDataCounter: innerResult.validDataCounter,
                  duplicateInFile: 0,
                  duplicateInMongo: 0,
                });
              } catch {
                throw new BadRequestException();
              }
              counter += 1;
              if (counter === files.length) {
                readingStatus = 'Uploaded';
                this.csvService.numberOfData = 0;
                this.csvService.numberOfUploadedData = 0;
                resolve(result);
              }
            })
            .catch((err) => {
              reject(err);
            });
        });
      });
      return { result: await res };
    } catch (e) {
      console.log(e);
      readingStatus = 'ERROR';
      throw new InternalServerErrorException();
    } finally {
      this.csvService.numberOfData = 0;
    }
  }
}
