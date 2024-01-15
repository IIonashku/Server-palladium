import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  HttpStatus,
  InternalServerErrorException,
  Param,
  Post,
  Req,
  Res,
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
import { LimitAndFilters } from './swagger.csv.dto';
import { Response } from 'express';
import { createReadStream } from 'node:fs';
import { JwtService } from '@nestjs/jwt';
import {
  analisysResultData,
  apiResult,
  csvResultData,
  exportResultData,
} from 'src/types/csv.controller.result.types';
import { csvUpdateCarrierSchema } from 'src/types/csv.types';

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
  constructor(
    private readonly csvService: CsvService,
    private readonly jwtService: JwtService,
  ) {}

  private numFileExporting: number = 0;

  @ApiOperation({ summary: 'get data count' })
  @Post('/count/')
  async getCsvDataLenght(@Body('filters') filters?: any): Promise<number> {
    return await this.csvService.getDataLenght(filters);
  }

  @ApiOperation({ summary: 'get list data count' })
  @Post('/analis/data/count/:fileName')
  async getAnalisysValidDataLenght(
    @Param('fileName') fileName: any,
    @Body('inBase') inBase: boolean,
    @Body('nullTypeAndCarrier') nullTypeAndCarrier: boolean,
    @Body('carrier') carrier: string,
  ): Promise<number> {
    return await this.csvService.getAnalisysValidData(
      fileName,
      inBase,
      nullTypeAndCarrier,
      carrier,
    );
  }

  @ApiOperation({ summary: 'Get data for front-end' })
  @ApiBody({ type: LimitAndFilters })
  @Post('/data/')
  async getCsvData(
    @Body('options') options: any,
    @Body('filters') filters: any,
    @Body('displayStrings') displayStrings: string[],
  ): Promise<csvResultData[]> {
    if (options.skips < 0 && options.limits < 0) {
      throw new BadRequestException('Options not correct');
    }

    return await this.csvService.getData(
      options.skips,
      options.limits,
      filters,
      displayStrings,
    );
  }

  @ApiOperation({ summary: 'Get data for front-end' })
  @ApiBody({ type: LimitAndFilters })
  @Post('/export/:fileName')
  async exportData(
    @Body('filters') filters: any,
    @Body('displayStrings') displayStrings: string[],
    @Param('fileName') fileName: string,
  ) {
    this.numFileExporting++;
    await this.csvService.exportData(filters, displayStrings, fileName);
    this.numFileExporting--;
    return true;
  }

  @ApiOperation({ summary: 'Get data for front-end' })
  @ApiBody({ type: LimitAndFilters })
  @Get('/download/:fileName')
  async downloadExportFile(
    @Res() response: Response,
    @Param('fileName') fileName: string,
  ) {
    response.setHeader(
      'Content-Disposition',
      `attachment; filename=${fileName}.csv`,
    );
    try {
      const fileToUpload = createReadStream(`./export/${fileName}.csv`);
      fileToUpload.pipe(response);
    } catch {
      throw new HttpException('File not exist', HttpStatus.BAD_REQUEST);
    }
  }

  @Post('/analisys/count/')
  async getAnalisysDataLenght(): Promise<number> {
    return await this.csvService.getAnalisysDataLenght();
  }

  @ApiOperation({ summary: 'Get data for front-end' })
  @ApiBody({ type: LimitAndFilters })
  @Post('/analisys/data/')
  async getAnalisysData(@Body() options: any): Promise<analisysResultData[]> {
    if (options.options.skips < 0 && options.options.limits < 0) {
      throw new BadRequestException('Options not correct');
    }
    return await this.csvService.getAnalisysData(
      options.options.skips,
      options.options.limits,
    );
  }

  @ApiOperation({ summary: 'Get all List tag for front-end' })
  @Post('/analisys/tags')
  async getListTags(): Promise<analisysResultData[]> {
    return await this.csvService.getListTags();
  }

  @Public()
  @Get('check/reading')
  isReading() {
    return {
      status: readingStatus,
      uploadedData: this.csvService.numberOfUploadedData,
      lines: this.csvService.numberOfData,
      numOfFile: numOfFile,
    };
  }

  @Public()
  @Get('check/export/reading')
  isExporting() {
    return {
      exportedData: this.csvService.numberOfExportFile,
      dataLimit: this.csvService.numberOfExportFileLimit,
      fileExporting: this.numFileExporting,
    };
  }

  @ApiOperation({ summary: 'Read data from existed csv file in server' })
  @Delete('/analisys/delete/:fileName')
  async deleteAnalisys(@Param('fileName') fileName: string) {
    try {
      const deletedAnalisys = await this.csvService.deleteAnalisys(fileName);
      return {
        deletedData: deletedAnalisys.deletedCount,
        deletedAnalisys: deletedAnalisys.deletedFile,
      };
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
                const analis = await this.csvService.saveAnalisys(
                  innerResult,
                  'upload',
                );
                if (analis === 'ERROR')
                  result.push({
                    error: 'Error',
                    message: `file: ${file.filename} is already exist`,
                  });
                else result.push([innerResult, file.filename]);
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
      await res;
      this.csvService.numberOfData = 0;
      return { result: await res };
    } catch (e) {
      console.log(e);
      readingStatus = 'ERROR';
      throw new InternalServerErrorException();
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
                const analis = await this.csvService.saveAnalisys(
                  innerResult,
                  'update',
                );
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
      await res;
      this.csvService.numberOfData = 0;
      return { result: await res };
    } catch (e) {
      console.log(e);
      readingStatus = 'ERROR';
      throw new InternalServerErrorException();
    }
  }

  @ApiOperation({ summary: 'check phone number`s carrier and type' })
  @ApiParam({ name: 'phoneNumber' })
  @Get('/check/carrier/:phoneNumber')
  async checkCarrier(
    @Param('phoneNumber') phoneNumber: any,
  ): Promise<csvUpdateCarrierSchema> {
    try {
      return await this.csvService.detectCarrier(phoneNumber);
    } catch (e) {
      throw new HttpException(e, 500);
    }
  }

  @ApiOperation({ summary: 'check phone number`s carrier and type' })
  @ApiBody({})
  @Post('/check/carrier/')
  async checkArrayCarrier(@Body('filters') filters: any): Promise<apiResult> {
    try {
      return await this.csvService.detectArrayCarrier(filters);
    } catch (e) {
      throw new HttpException(e, 500);
    }
  }

  @ApiOperation({ summary: 'Fix all damaged lastname in database' })
  @Get('/fix/lastname')
  async fixLastName(): Promise<number> {
    return await this.csvService.fixBrokenLastName();
  }

  @ApiOperation({ summary: 'Fix all damaged carrier in database' })
  @Get('/fix/carrier')
  async fixCarrier(): Promise<number> {
    return await this.csvService.fixBrokenCarrierName();
  }

  @ApiOperation({ summary: 'delete base which already in data' })
  @Get('/base/clear')
  async clearBase(): Promise<number> {
    return await this.csvService.clearBase();
  }

  @ApiOperation({ summary: 'get all Export file available' })
  @Get('/export/files')
  async getExportFiles(): Promise<exportResultData[]> {
    return await this.csvService.getExportFiles();
  }

  @ApiOperation({ summary: 'get all Export file available' })
  @Get('/export/delete/:fileName')
  async deleteExportFile(
    @Param('fileName') fileName: string,
  ): Promise<exportResultData> {
    return await this.csvService.deleteExportFile(fileName);
  }

  @ApiOperation({ summary: 'get data count' })
  @Get('/fix/count/')
  async getBrokenDataLenght() {
    return await this.csvService.getBrokenDataLenght();
  }

  @ApiOperation({ summary: 'set/update all data analisys' })
  @Get('analisys/all/set/')
  async setData(@Req() req: Request): Promise<string> {
    const token: any = req.headers;
    const payload: any = this.jwtService.decode(
      token.authorization.split(' ')[1],
    );
    if (payload.role === 'ADMIN') {
      return await this.csvService.setCountNullTypeAndCarrier();
    } else {
      throw new HttpException(
        'Only admin user can use this updater',
        HttpStatus.UNAUTHORIZED,
      );
    }
  }

  @ApiOperation({ summary: 'set/update all list tags analisys' })
  @Get('/analisys/tags/set/')
  async setDataListTag(@Req() req: Request): Promise<string> {
    const token: any = req.headers;
    const payload: any = this.jwtService.decode(
      token.authorization.split(' ')[1],
    );
    if (payload.role === 'ADMIN') {
      return await this.csvService.updateAnalisysCountData();
    } else {
      throw new HttpException(
        'Only admin user can use this updater',
        HttpStatus.UNAUTHORIZED,
      );
    }
  }

  @ApiOperation({ summary: 'Check if exist specific analisys' })
  @Post('/analisys/check/')
  async getAnalisys(@Body('fileName') fileName: string): Promise<boolean> {
    return await this.csvService.checkAnalisys(fileName);
  }

  @ApiOperation({ summary: 'Get specific list tag' })
  @Get('/analis/get/:fileName')
  async getSpecificTag(
    @Param('fileName') fileName: string,
  ): Promise<analisysResultData> {
    return await this.csvService.getSpecificTag(fileName);
  }

  @ApiOperation({ summary: 'Find and update canadian numbers' })
  @Get('/data/canadian/')
  async updateCanadian(): Promise<number> {
    return await this.csvService.checkCanadianNumber();
  }
}
