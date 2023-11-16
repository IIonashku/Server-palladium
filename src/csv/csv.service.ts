import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Csv } from './csv.entity';
import { Model } from 'mongoose';
import * as fs from 'fs';
import { parse } from 'csv-parse';
import phone from 'phone';
import { CsvInsertDto } from './csv.dto';
import { stringify } from 'csv-stringify';

@Injectable()
export class CsvService {
  constructor(@InjectModel(Csv.name) private readonly csvModel: Model<Csv>) {}

  async createStream(fileName) {
    return await fs.createReadStream(`./csvs/${fileName}`, 'utf8');
  }

  async saveDataToBD(data: CsvInsertDto[], fileName: string, model: any) {
    let dublicateInMongo;
    console.log(1);
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
            if (await validPhone.isValid) {
              const phonesSize = phones.size;
              phones.add(row[0]);
              row[0] = validPhone.phoneNumber;
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
                  console.log(data.length);
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

  async getAllData() {
    const data = await this.csvModel
      .find({})
      .select([
        '_id',
        'phoneNumber',
        'firstName',
        'lastName',
        'carrier',
        'listTag',
      ]);
    const jsonData = JSON.stringify(data);
    return jsonData;
  }

  async getData(skips: number, limits: number) {
    const data = await this.csvModel
      .find({}, {}, { skip: skips, limit: limits })
      .select([
        '_id',
        'phoneNumber',
        'firstName',
        'lastName',
        'carrier',
        'listTag',
      ]);
    const jsonData = JSON.stringify(data);
    return jsonData;
  }
  async getDataLenght() {
    const count = await this.csvModel.count();
    return count;
  }

  async exportDataToFile(): Promise<any> {
    const fileName = 'Export_csv_file.csv';
    const data = await this.csvModel
      .find({})
      .select([
        '_id',
        'phoneNumber',
        'firstName',
        'lastName',
        'carrier',
        'listTag',
      ]);

    const columns = {
      _id: '_id',
      phoneNumber: 'phoneNumber',
      firstName: 'firstName',
      lastName: 'lastName',
      carrier: 'carrier',
      listTag: 'listTag',
    };
    const writingPromise = new Promise(async (res, rej) => {
      stringify(
        data,
        { header: true, columns: columns },
        async (err, output) => {
          if (err) throw err;
          const filePromis = new Promise((resolve, reject) => {
            fs.writeFile(fileName, output, (err) => {
              if (err) throw err;
              console.log('csv saved');
              resolve('Success');
            });
          });
          await filePromis;
          res('Writed');
        },
      );
    }).catch((e) => {
      console.log(e);
      throw new InternalServerErrorException(e);
    });
    return await writingPromise;
  }
}
