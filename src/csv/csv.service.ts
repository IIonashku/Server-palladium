import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Csv } from './main/csv.schema';
import { Model } from 'mongoose';
import * as fs from 'fs';
import { parse } from 'csv-parse';
import phone from 'phone';
import { CsvInsertDto, CsvUpdateDto } from './main/csv.dto';
import { Analisys } from './analisys/csv.analisys.schema';
import { Basecsv } from './base/base.csv.schema';

type allFilter = {
  phoneNumber: object;
  listTag: object;
  carrier: object | null;
  type: null;
  inBase: object | undefined;
};

type optionalFilter = Partial<allFilter>;

@Injectable()
export class CsvService {
  public numberOfUploadedData: number = 0;
  public numberOfData: number = 0;
  constructor(
    @InjectModel(Csv.name) private readonly csvModel: Model<Csv>,
    @InjectModel(Analisys.name) private readonly analisysModel: Model<Analisys>,
    @InjectModel(Basecsv.name) private readonly baseModel: Model<Basecsv>,
  ) {}

  async createStream(fileName) {
    return fs.createReadStream(`./csvs/${fileName}`, 'utf8');
  }

  async saveDataToBD(
    data: CsvInsertDto[],
    phones: string[],
    fileName: string,
    modelCsv: Model<Csv>,
    modelBase: Model<Basecsv>,
  ) {
    let duplicateInMongo: number;
    let duplicateInBase: number;

    try {
      await modelCsv.insertMany(data, {
        ordered: false,
      });
    } catch (e) {
      if (e.code === 11000) {
        const csvIds = await e.result.result.writeErrors.map((error) => {
          return error.err.op.phoneNumber;
        });
        duplicateInMongo = await csvIds.length;
        await modelCsv.updateMany(
          { phoneNumber: { $in: csvIds } },
          { $push: { listTag: fileName } },
        );
      }
    }

    try {
      const finded: any = await modelBase.find(
        { phoneNumber: { $in: phones } },
        { _id: false, __v: false },
      );
      const bulkOps = [];
      duplicateInBase = finded.length;
      for (let i = 0; i < finded.length; i++) {
        const filter = { phoneNumber: finded[i].phoneNumber };
        const update = {
          $set: {
            firstName: finded[i].firstName,
            lastName: finded[i].lastName,
            type: finded[i].type,
            carrier: finded[i].carrier,
            inBase: true,
          },
        };
        bulkOps.push({
          updateOne: {
            filter,
            update,
            upsert: true,
          },
        });
        finded[i].listTag = [];
      }
      await modelCsv.bulkWrite(bulkOps);
    } catch (e) {
      console.log(e);
      console.log('Was duplicate, ignore it');
    }

    return {
      duplicateInMongo: duplicateInMongo,
      row: data.length,
      duplicateInBase: duplicateInBase,
    };
  }

  async readFile(fileName: string): Promise<any> {
    this.getCountOfLine(fileName);

    let data: CsvInsertDto[] = [];
    let lenghtOfData = 0;
    let uploadingphones = [];
    let countOfDuplicateInFile: number = 0;
    let duplicateInMongo: number = 0;
    let badCounter = 0;
    let duplicateInBase = 0;

    const model = this.csvModel;
    const modelBase = this.baseModel;
    const phones = new Set();

    const csvStream = await this.createStream(fileName);
    const saver = this.saveDataToBD;

    let first = true;
    const parser = parse({
      delimiter: ',',
      from_line: 1,
      skip_empty_lines: true,
      skip_records_with_error: true,
      relax_column_count_less: true,
      relax_column_count_more: true,
    });
    const onData = async (row: string[]) => {
      const validPhone = phone(row[0]);
      if (first) {
        first = false;
        for (let i = 0; i < row.length; i++) {
          switch (row[i].toLowerCase()) {
            case 'firstname':
              firstNameIndex = i;
              break;
            case 'lastname':
              lastNameIndex = i;
              break;
            case 'type':
              typeIndex = i;
              break;
            case 'carrier':
              carrierIndex = i;
              break;
          }
        }
      }
      if (validPhone.isValid) {
        row[0] = validPhone.phoneNumber.slice(1, validPhone.phoneNumber.length);
        const phonesSize = phones.size;
        phones.add(row[0]);
        const element: CsvInsertDto = {
          phoneNumber: row[phoneNumberIndex],
          firstName: row[firstNameIndex],
          lastName: row[lastNameIndex],
          type: row[typeIndex] ? row[typeIndex].toLowerCase() : undefined,
          carrier: row[carrierIndex] ? row[carrierIndex] : null,
          inBase: false,
          listTag: fileName,
        };
        if (phonesSize !== phones.size) {
          data.push(element);
          uploadingphones.push(row[phoneNumberIndex]);
          if (data.length === 50000) {
            this.numberOfUploadedData += 50000;
            lenghtOfData += data.length;
            saver(data, uploadingphones, fileName, model, modelBase).then(
              (res) => {
                duplicateInMongo += res.duplicateInMongo;
                duplicateInBase += res.duplicateInBase;
                parser.resume();
              },
            );
            parser.pause();

            data = [];
            uploadingphones = [];
          }
        } else {
          countOfDuplicateInFile += 1;
        }
      } else {
        badCounter += 1;
      }
    };
    /////////////////////////////////////////////////////////////
    const phoneNumberIndex = 0;
    let firstNameIndex = 10;
    let lastNameIndex = 10;
    let typeIndex = 10;
    let carrierIndex = 10;

    const result = await new Promise(async (resolve, reject) => {
      csvStream.pipe(
        parser
          .on('data', onData)
          .on('end', async function () {
            console.log('Data has been readed');
            await saver(data, uploadingphones, fileName, model, modelBase).then(
              (res) => {
                duplicateInMongo += res.duplicateInMongo;
                duplicateInBase += res.duplicateInBase;
              },
            );
            lenghtOfData += data.length;
            resolve({
              badDataCounter: badCounter,
              duplicateInFile: countOfDuplicateInFile,
              duplicateInMongo: duplicateInMongo,
              validDataCounter: lenghtOfData,
              duplicateInBase: duplicateInBase,
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

  async updateDataToBD(
    chunk: CsvUpdateDto[],
    model: Model<Csv>,
    fileName: string,
  ) {
    const bulkOps = [];
    try {
      chunk.forEach((data) => {
        const filter = { phoneNumber: data.phoneNumber };
        const update = {
          $set: {
            firstName: data.firstName,
            lastName: data.lastName,
          },
          $push: { listTag: fileName },
        };
        bulkOps.push({
          updateOne: {
            filter,
            update,
            upsert: true,
          },
        });
      });
      const result = await model.bulkWrite(bulkOps);
      return result.modifiedCount;
    } catch (e) {
      throw new InternalServerErrorException(e);
    }
  }

  async updateData(fileName: string): Promise<any> {
    this.getCountOfLine(fileName);

    const updater = this.updateDataToBD;

    const phones = new Set();
    let lenghtOfData = 0;
    let duplicateInFile = 0;
    let duplicateInMongo = 0;
    let data: CsvUpdateDto[] = [];
    let badCounter = 0;

    const model = this.csvModel;

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
      if (first) {
        first = false;
        for (let i = 0; i < row.length; i++) {
          switch (row[i].toLowerCase()) {
            case 'firstname':
              firstNameIndex = i;
              break;
            case 'lastname':
              lastNameIndex = i;
              break;
            // case 'type':
            //   typeIndex = i;
            //   break;
            // case 'carrier':
            //   carrierIndex = i;
            //   break;
          }
        }
      }
      const validPhone = phone(row[0]);
      if (validPhone.isValid) {
        row[0] = validPhone.phoneNumber.slice(1, validPhone.phoneNumber.length);
        const phonesSize = phones.size;
        phones.add(row[0]);

        const element: CsvUpdateDto = {
          phoneNumber: row[phoneNumberIndex],
          firstName: row[firstNameIndex],
          lastName: row[lastNameIndex],
        };

        if (phones.size > phonesSize) data.push(element);
        else duplicateInFile++;

        if (data.length >= 5000) {
          this.numberOfUploadedData += data.length;
          lenghtOfData += data.length;
          updater(data, model, fileName).then((result) => {
            duplicateInMongo += result;
            parser.resume();
          });
          parser.pause();

          data = [];
        }
      } else {
        badCounter += 1;
      }
    };

    ////////////////////////////////////////////////////

    const phoneNumberIndex = 0;
    let firstNameIndex = 10;
    let lastNameIndex = 10;
    // let typeIndex = 10;
    // let carrierIndex = 10;
    let first = true;

    const result = await new Promise(async (resolve, reject) => {
      csvStream.pipe(
        parser
          .on('data', onData)
          .on('end', async function () {
            setTimeout(async () => {
              console.log('Data has been readed');
              this.numberOfUploadedData += data.length;
              lenghtOfData += data.length;
              const result = await updater(data, model, fileName);
              duplicateInMongo += result;
              resolve({
                duplicateInFile: duplicateInFile,
                duplicateInMongo: duplicateInMongo,
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
  async getCountOfLine(fileName: string) {
    let lineCount = 0;
    const csvStream = await this.createStream(fileName);
    const parser = parse({
      delimiter: ',',
      from_line: 1,
      skip_empty_lines: true,
      skip_records_with_error: true,
      relax_column_count_less: true,
      relax_column_count_more: true,
    });
    csvStream.pipe(
      parser
        .on('data', () => {
          lineCount++;
        })
        .on('end', () => {
          this.numberOfData += lineCount;
        }),
    );
  }

  async saveAnalisys(analisys: any) {
    try {
      const newAnalisys = new this.analisysModel(analisys);
      await newAnalisys.save();
    } catch (e) {
      return 'ERROR';
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
      if (
        filters.filters.carrier &&
        filters.filters.carrier !== 'nullTypeAndCarrier'
      )
        f.carrier = { $regex: RegExp(filters.filters.carrier) };
      else if (filters.filters.carrier === 'nullTypeAndCarrier') {
        f.carrier = null;
        f.type = null;
      }
      if (filters.filters.inBase != undefined)
        f.inBase = filters.filters.inBase;
    }
    const data = await this.csvModel
      .find(f, {}, { skip: skips, limit: limits })
      .select([
        'phoneNumber',
        'firstName',
        'lastName',
        'type',
        'carrier',
        'listTag',
        'inBase',
      ]);
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
      if (
        filters.filters.carrier &&
        filters.filters.carrier !== 'nullTypeAndCarrier'
      )
        f.carrier = { $regex: RegExp(filters.filters.carrier) };
      else if (filters.filters.carrier === 'nullTypeAndCarrier') {
        f.carrier = null;
        f.type = null;
      }
      if (filters.filters.inBase != undefined)
        f.inBase = filters.filters.inBase;
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

  async getListTags() {
    const data = await this.analisysModel
      .find({}, {}, {})
      .select(['fileName', 'validDataCounter']);
    const jsonData = JSON.stringify(data);
    return jsonData;
  }

  async getAnalisysDataLenght() {
    const count = await this.analisysModel.count({});
    return count;
  }

  async deleteAnalisys(fileName: string) {
    const deleted = await this.analisysModel.findOneAndDelete({
      fileName: fileName,
    });
    return deleted;
  }

  async deleteDataOfAnalisys(fileName: string) {
    const reg = RegExp(fileName);
    const deleted = await this.csvModel.deleteMany({
      listTag: { $elemMatch: { $regex: reg } },
    });
    return deleted.deletedCount;
  }
}
