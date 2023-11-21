import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Csv } from './csv.entity';
import { Model } from 'mongoose';
import * as fs from 'fs';
import { parse } from 'csv-parse';
import phone from 'phone';
import { CsvInsertDto } from './csv.dto';

type allFilter = {
  phoneNumber: object;
  listTag: object;
  carrier: object;
};

type optionalFilter = Partial<allFilter>;

@Injectable()
export class CsvService {
  constructor(@InjectModel(Csv.name) private readonly csvModel: Model<Csv>) {}

  async createStream(fileName) {
    return fs.createReadStream(`./csvs/${fileName}`, 'utf8');
  }

  async saveDataToBD(data: CsvInsertDto[], fileName: string, model: any) {
    let dublicateInMongo: number;
    try {
      await model.insertMany(data, {
        ordered: false,
      });
    } catch (e) {
      if (e.code === 11000) {
        const csvIds = await e.result.result.writeErrors.map((error) => {
          return error.err.op.phoneNumber;
        });
        dublicateInMongo = await csvIds.length;
        await model.updateMany(
          { phoneNumber: { $in: csvIds } },
          { $push: { listTag: fileName } },
        );
      }
    }
    return dublicateInMongo;
  }

  async readFile(fileName: string) {
    let data: CsvInsertDto[] = [];
    let lenghtOfData = 0;
    const phones = new Set();
    let countOfDuplicateInFile: number = 0;
    let dublicateInMongo: number = 0;
    const model = this.csvModel;
    let badCounter = 0;
    const saver = this.saveDataToBD;
    const result = await new Promise(async (resolve, reject) => {
      (await this.createStream(fileName)).pipe(
        parse({
          delimiter: ',',
          from_line: 1,
          skip_empty_lines: true,
          skip_records_with_error: true,
          relax_column_count_less: true,
          relax_column_count_more: true,
        })
          .on('data', async function (row) {
            const validPhone = phone(row[0]);
            if (validPhone.isValid) {
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
                if (data.length === 10000) {
                  lenghtOfData += data.length;
                  const duplicates = saver(data, fileName, model);

                  data = [];
                }
              } else {
                countOfDuplicateInFile += 1;
              }
            } else {
              badCounter += 1;
            }
          })
          .on('end', async function () {
            console.log('Data has been readed');

            try {
              lenghtOfData += data.length;

              await model.insertMany(data, {
                ordered: false,
              });
            } catch (e) {
              if (e.code === 11000) {
                const csvIds = await e.result.result.writeErrors.map(
                  (error) => {
                    return error.err.op.phoneNumber;
                  },
                );
                dublicateInMongo += await csvIds.length;
                await model.updateMany(
                  { phoneNumber: { $in: csvIds } },
                  { $push: { listTag: fileName } },
                );
              }
            }
            resolve({
              notValid: badCounter,
              duplicateInFile: countOfDuplicateInFile,
              dublicateInMongo: dublicateInMongo,
              data: lenghtOfData,
            });
          })
          .on('error', function (error) {
            reject(error);
          }),
      );
    });
    return await result;
  }

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
    if (filters.filter) {
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
}
