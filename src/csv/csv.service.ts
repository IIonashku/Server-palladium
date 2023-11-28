import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Csv } from './csv.schema';
import { Model } from 'mongoose';
import * as fs from 'fs';
import { parse } from 'csv-parse';
import phone from 'phone';
import { CsvInsertDto, CsvUpdateDto } from './csv.dto';
import { Analisys } from './csv.analisys.schema';
type allFilter = {
  phoneNumber: object;
  listTag: object;
  carrier: object;
};

type optionalFilter = Partial<allFilter>;

@Injectable()
export class CsvService {
  public numberOfUploadedData: number = 0;
  constructor(
    @InjectModel(Csv.name) private readonly csvModel: Model<Csv>,
    @InjectModel(Analisys.name) private readonly analisysModel: Model<Analisys>,
  ) {}

  async createStream(fileName) {
    return fs.createReadStream(`./csvs/${fileName}`, 'utf8');
  }

  async saveDataToBD(
    data: CsvInsertDto[],
    fileName: string,
    model: Model<Csv>,
  ) {
    let duplicateInMongo: number;
    try {
      await model.insertMany(data, {
        ordered: false,
      });
    } catch (e) {
      if (e.code === 11000) {
        const csvIds = await e.result.result.writeErrors.map((error) => {
          return error.err.op.phoneNumber;
        });
        duplicateInMongo = await csvIds.length;
        await model.updateMany(
          { phoneNumber: { $in: csvIds } },
          { $push: { listTag: fileName } },
        );
      }
    }
    return { duplicateInMongo: duplicateInMongo, row: data.length };
  }

  async updateDataToBD(data: CsvUpdateDto[], model: Model<Csv>) {
    const dataLenght = data.length;
    let updatedData: number = 0;
    try {
      const updateResult = new Promise(async (resolve) => {
        for (let i = 0; i < dataLenght; i++) {
          console.log(updatedData);
          await model.findOneAndUpdate(
            { phoneNumber: data[i].phoneNumber },
            data[i],
            { upsert: true },
          );
          updatedData++;
        }
        if (updatedData === dataLenght) {
          resolve(updatedData);
        }
      });
      return updateResult;
    } catch (e) {
      console.log(e);
      throw new InternalServerErrorException(e);
    }
  }

  async readFile(fileName: string): Promise<any> {
    let data: CsvInsertDto[] = [];
    let lenghtOfData = 0;
    const phones = new Set();
    let countOfDuplicateInFile: number = 0;
    let duplicateInMongo: number = 0;
    const model = this.csvModel;
    let badCounter = 0;
    const csvStream = await this.createStream(fileName);
    const saver = this.saveDataToBD;
    const parser = parse({
      delimiter: ',',
      from_line: 1,
      skip_empty_lines: true,
      skip_records_with_error: true,
      relax_column_count_less: true,
      relax_column_count_more: true,
    });
    const onData = async (row) => {
      const validPhone = phone(row[0]);
      if (validPhone.isValid) {
        row[0] = validPhone.phoneNumber.slice(1, validPhone.phoneNumber.length);
        const phonesSize = phones.size;
        phones.add(row[0]);
        const element: CsvInsertDto = {
          phoneNumber: row[0],
          firstName: row[1],
          lastName: row[2],
          carrier: row[4] ? row[4] : null,
          listTag: fileName,
        };
        if (phonesSize !== phones.size) {
          data.push(element);
          if (data.length === 50000) {
            this.numberOfUploadedData += 50000;
            lenghtOfData += data.length;
            saver(data, fileName, model).then((res) => {
              duplicateInMongo += res.duplicateInMongo;
              parser.resume();
            });
            parser.pause();

            data = [];
          }
        } else {
          countOfDuplicateInFile += 1;
        }
      } else {
        badCounter += 1;
      }
    };
    /////////////////////////////////////////////////////////////

    const result = await new Promise(async (resolve, reject) => {
      csvStream.pipe(
        parser
          .on('data', onData)
          .on('end', async function () {
            console.log('Data has been readed');
            await saver(data, fileName, model).then((res) => {
              duplicateInMongo += res.duplicateInMongo;
            });
            lenghtOfData += data.length;
            resolve({
              badDataCounter: badCounter,
              duplicateInFile: countOfDuplicateInFile,
              duplicateInMongo: duplicateInMongo,
              validDataCounter: lenghtOfData,
            });
          })
          .on('error', function (error) {
            reject(error);
          }),
      );
    });
    return await result;
  }

  //////////////////////////////////////////////////////

  async updateData(fileName: string): Promise<any> {
    let lenghtOfData = 0;
    const model = this.csvModel;
    let badCounter = 0;
    let lastPromise;
    const csvStream = await this.createStream(fileName);
    const parser = parse({
      delimiter: ',',
      from_line: 1,
      skip_empty_lines: true,
      skip_records_with_error: true,
      relax_column_count_less: true,
      relax_column_count_more: true,
    });
    const onData = async (row) => {
      const validPhone = phone(row[0]);
      if (validPhone.isValid) {
        row[0] = validPhone.phoneNumber.slice(1, validPhone.phoneNumber.length);
        const element: CsvUpdateDto = {
          phoneNumber: row[0],
          firstName: row[1],
          lastName: row[2],
        };
        lastPromise = model
          .findOneAndUpdate({ phoneNumber: element.phoneNumber }, element, {
            upsert: true,
          })
          .then(() => {
            parser.resume();
            lenghtOfData++;
          });
        if (lenghtOfData >= 4) {
          this.numberOfUploadedData = lenghtOfData;
          parser.pause();
        }
      } else {
        badCounter += 1;
      }
    };

    ////////////////////////////////////////////////////

    const result = await new Promise(async (resolve, reject) => {
      csvStream.pipe(
        parser
          .on('data', onData)
          .on('end', async function () {
            setTimeout(async () => {
              await lastPromise;
              console.log('Data has been readed');
              resolve({
                badDataCounter: badCounter,
                validDataCounter: lenghtOfData,
              });
            }, 1000);
          })
          .on('error', function (error) {
            reject(error);
          }),
      );
    });
    return await result;
  }

  async saveAnalisys(analisys: any) {
    try {
      const newAnalisys = new this.analisysModel(analisys);
      await newAnalisys.save();
    } catch (e) {
      console.log(e);
      return 'Error';
    }
  }

  //////////////////////////////////////////////////////

  async getData(skips: number, limits: number, filters: any = undefined) {
    const f: optionalFilter = {};
    if (filters.filters) {
      if (filters.filters.phoneNumber)
        f.phoneNumber = { $regex: RegExp(filters.filters.phoneNumber) };
      if (filters.filters.listTag)
        f.listTag = { $elemMatch: { $regex: RegExp(filters.filters.listTag) } };
      if (filters.filters.carrier)
        f.carrier = { $regex: RegExp(filters.filters.carrier) };
    }
    const data = await this.csvModel
      .find(f, {}, { skip: skips, limit: limits })
      .select(['phoneNumber', 'firstName', 'lastName', 'carrier', 'listTag']);
    const jsonData = JSON.stringify(data);
    return jsonData;
  }

  async getDataLenght(filters?: any) {
    const f: optionalFilter = {};
    if (filters.filters) {
      if (filters.filters.phoneNumber)
        f.phoneNumber = { $regex: RegExp(filters.filters.phoneNumber) };
      if (filters.filters.listTag)
        f.listTag = { $elemMatch: { $regex: RegExp(filters.filters.listTag) } };
      if (filters.filters.carrier)
        f.carrier = { $regex: RegExp(filters.filters.carrier) };
    }
    const count = await this.csvModel.count(f);
    return count;
  }

  async getAnalisysData(skips: number, limits: number) {
    const data = await this.analisysModel.find(
      {},
      {},
      { skip: skips, limit: limits },
    );
    const jsonData = JSON.stringify(data);
    return jsonData;
  }

  async getAnalisysDataLenght() {
    const count = await this.analisysModel.count({});
    return count;
  }
}
