import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  InternalServerErrorException,
  Param,
  Post,
  UnsupportedMediaTypeException,
  UploadedFiles,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { CsvService } from './csv.service';
import { AuthGuard } from 'src/auth/auth.guard';
import { ApiCsvFiles } from '../decorators/api-file.fields.decorator';
import { Public } from 'src/auth/public.declaration';
import { LimitAndFilters, NumberString } from './swagger.csv.dto';
import phone from 'phone';

let readingStatus: string = 'Not reading';
export let numOfFile: number = 0;
export const fileReaded = (): void => {
  numOfFile -= 1;
};
@ApiTags('CSV controller')
@UseGuards(AuthGuard)
@ApiBearerAuth('JWT-auth')
@Controller('csv')
export class CsvController {
  constructor(private readonly csvService: CsvService) {}

  @Post('/count/')
  async getCsvDataLenght(@Body('filters') filters?: any) {
    return await this.csvService.getDataLenght(filters);
  }

  @ApiOperation({ summary: 'Get data for front-end' })
  @ApiBody({ type: LimitAndFilters })
  @Post('/data/')
  async getCsvData(
    @Body('options') options: any,
    @Body('filters') filters: any,
    @Body('displayStrings') displayStrings: string[],
  ) {
    if (options.skips < 0 && options.limits < 0) {
      throw new BadRequestException('Options not correct');
    }

    const response = await this.csvService.getData(
      options.skips,
      options.limits,
      filters,
      displayStrings,
    );
    return response;
  }

  @Post('/analisys/count/')
  async getAnalisysDataLenght() {
    return await this.csvService.getAnalisysDataLenght();
  }

  @ApiOperation({ summary: 'Get data for front-end' })
  @ApiBody({ type: LimitAndFilters })
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
      numOfFile: numOfFile,
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

  @ApiOperation({ summary: 'Read data from existed csv file in server' })
  @Delete('/analisys/delete/:fileName')
  async deleteAnalisys(@Param('fileName') fileName: string) {
    try {
      const deletedData = await this.csvService.deleteDataOfAnalisys(fileName);
      const deletedAnalisys = await this.csvService.deleteAnalisys(fileName);
      return { deletedData: deletedData, deletedAnalisys: deletedAnalisys };
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
      numOfFile += 1;
      if (files[i].mimetype !== 'text/csv') {
        numOfFile = 0;
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
              try {
                const analis = await this.csvService.saveAnalisys({
                  fileName: file.filename,
                  badDataCounter: Number(innerResult.badDataCounter),
                  validDataCounter: Number(innerResult.validDataCounter),
                  duplicateInFile: innerResult.duplicateInFile
                    ? Number(innerResult.duplicateInFile)
                    : 0,
                  duplicateInMongo: innerResult.duplicateInMongo
                    ? Number(innerResult.duplicateInMongo)
                    : 0,
                  duplicateInBase: innerResult.duplicateInBase,
                });
                if (analis === 'ERROR')
                  result.push({
                    error: 'Error',
                    message: `file: ${file.filename} is already exist`,
                  });
                else result.push([await innerResult, file.filename]);
              } catch {
                throw new BadRequestException();
              }
              counter += 1;
              if (counter === files.length) {
                if (numOfFile === files.length) {
                  readingStatus = 'Uploaded';
                  this.csvService.numberOfData = 0;
                  this.csvService.numberOfUploadedData = 0;
                } else {
                  numOfFile -= files.length;
                }

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
              try {
                const analis = await this.csvService.saveAnalisys({
                  fileName: file.filename + '.update',
                  badDataCounter: innerResult.badDataCounter,
                  validDataCounter: innerResult.validDataCounter,
                  duplicateInFile: innerResult.duplicateInFile
                    ? Number(innerResult.duplicateInFile)
                    : 0,
                  duplicateInMongo: innerResult.duplicateInMongo
                    ? Number(innerResult.duplicateInMongo)
                    : 0,
                  duplicateInBase: 0,
                });
                if (analis === 'ERROR')
                  result.push({
                    error: 'Error',
                    message: `file: ${file.filename} is already exist`,
                  });
                else result.push([await innerResult, file.filename]);
              } catch {
                throw new BadRequestException();
              }
              counter += 1;
              if (counter === files.length) {
                if (numOfFile === files.length) {
                  readingStatus = 'Uploaded';
                  this.csvService.numberOfData = 0;
                  this.csvService.numberOfUploadedData = 0;
                } else {
                  numOfFile -= files.length;
                }
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

  @ApiOperation({ summary: 'check phone number`s carrier and type' })
  @ApiParam({ name: 'phoneNumber' })
  @Get('/check/carrier/:phoneNumber')
  async checkCarrier(@Param('phoneNumber') phoneNumber: any) {
    try {
      const result = await this.csvService.detectCarrier(phoneNumber);
      return result;
    } catch (e) {
      throw new HttpException(e, 500);
    }
  }

  @ApiOperation({ summary: 'check phone number`s carrier and type' })
  @ApiParam({ name: 'phoneNumber' })
  @Get('/check/carrier/test/:phoneNumber')
  async TestcheckCarrier(@Param('phoneNumber') phoneNumber: any) {
    try {
      const result = phone(phoneNumber);
      return result;
    } catch (e) {
      throw new HttpException(e, 500);
    }
  }

  @ApiOperation({ summary: 'check phone number`s carrier and type' })
  @ApiBody({ type: NumberString })
  @Post('/check/carrier/')
  async checkArrayCarrier(@Body('phoneNumber') phoneNumber: any[]) {
    try {
      const result = await this.csvService.detectArrayCarrier(phoneNumber);
      return result;
    } catch (e) {
      throw new HttpException(e, 500);
    }
  }
}
