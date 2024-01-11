import {
  HttpException,
  HttpStatus,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Csv } from './main/csv.schema';
import { Model } from 'mongoose';
import * as fs from 'fs';
import { parse } from 'csv-parse';
import phone from 'phone';
import { CsvInsertDto, CsvUpdateDto } from './main/csv.dto';
import { Analisys } from './analisys/csv.analisys.schema';
import { Basecsv } from './base/base.csv.schema';
import { HttpService } from '@nestjs/axios';
import { fileReaded, numOfFile } from './csv.controller';
import * as fsWrite from 'node:fs/promises';
import { Export } from './export/export.schema';
import { availableCarrier, deviceType } from 'src/types/csv.types';

type csvData = {
  phoneNumber: string;
  firstName: string;
  lastName: string;
  carrier: string;
  type: string;
  listTag: string;
};

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
  public numberOfExportFile: number = 0;
  public numberOfExportFileLimit: number = 0;
  constructor(
    @InjectModel(Csv.name) private readonly csvModel: Model<Csv>,
    @InjectModel(Analisys.name) private readonly analisysModel: Model<Analisys>,
    @InjectModel(Export.name) private readonly exportModel: Model<Export>,
    @InjectModel(Basecsv.name) private readonly baseModel: Model<Basecsv>,
    private readonly httpService: HttpService,
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
    analisysModel: Model<Analisys>,
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

    const DBInfo = await analisysModel.findOne({ fileName: 'DBInfo' });

    await analisysModel.findOneAndUpdate(
      {
        fileName: 'DBInfo',
      },
      {
        $set: {
          validDataCounter:
            (DBInfo.validDataCounter ? DBInfo.validDataCounter : 0) +
            data.length -
            duplicateInMongo,
        },
      },
      { upsert: true },
    );

    return {
      duplicateInMongo: duplicateInMongo,
      row: data.length,
      duplicateInBase: duplicateInBase,
    };
  }

  async readFile(fileName: string): Promise<any> {
    this.getCountOfLine(fileName);

    let data: CsvInsertDto[] = [];
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    let lenghtOfData = 0;
    let uploadingphones = [];
    const resultInfo = {
      countOfDuplicateInFile: 0,
      duplicateInMongo: 0,
      badCounter: 0,
      duplicateInBase: 0,
      nullTypeAndCarrier: 0,
      TMobileCount: 0,
      ATTCount: 0,
      verisonCount: 0,
    };

    const model = this.csvModel;
    const modelBase = this.baseModel;
    const analisysModel = this.analisysModel;
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
      const validPhone = phone(row[phoneNumberIndex]);

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
            case 'phone':
              phoneNumberIndex = i;
              break;
          }
        }
      }
      if (validPhone.isValid) {
        row[phoneNumberIndex] = validPhone.phoneNumber.slice(
          1,
          validPhone.phoneNumber.length,
        );

        const phonesSize = phones.size;
        phones.add(row[phoneNumberIndex]);
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
          if (
            element.carrier === 'T-Mobile' ||
            element.carrier === 'Metro by T-Mobile'
          )
            resultInfo.TMobileCount++;
          else if (
            element.carrier === 'Verizon' ||
            element.carrier === 'Verizon Wireless'
          )
            resultInfo.verisonCount++;
          else if (element.carrier === 'AT&T') resultInfo.ATTCount++;
          data.push(element);
          if (element.type === undefined && element.carrier === null)
            resultInfo.nullTypeAndCarrier++;
          uploadingphones.push(row[phoneNumberIndex]);
          if (data.length === Math.floor(500_000 / numOfFile)) {
            this.numberOfUploadedData += Math.floor(500_000 / numOfFile);
            lenghtOfData += data.length;
            saver(
              data,
              uploadingphones,
              fileName,
              model,
              modelBase,
              analisysModel,
            ).then((res) => {
              resultInfo.duplicateInMongo += res.duplicateInMongo;
              resultInfo.duplicateInBase += res.duplicateInBase;
              parser.resume();
            });
            parser.pause();

            data = [];
            uploadingphones = [];
          }
        } else {
          resultInfo.countOfDuplicateInFile += 1;
        }
      } else {
        resultInfo.badCounter += 1;
      }
    };
    /////////////////////////////////////////////////////////////
    let phoneNumberIndex = 0;
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
            await saver(
              data,
              uploadingphones,
              fileName,
              model,
              modelBase,
              analisysModel,
            ).then((res) => {
              resultInfo.duplicateInMongo += res.duplicateInMongo;
              resultInfo.duplicateInBase += res.duplicateInBase;
            });
            lenghtOfData += data.length;
            fileReaded();
            resolve(resultInfo);
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
            case 'phone':
              phoneNumberIndex = i;
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
      const validPhone = phone(row[phoneNumberIndex]);
      if (validPhone.isValid) {
        row[phoneNumberIndex] = validPhone.phoneNumber.slice(
          1,
          validPhone.phoneNumber.length,
        );
        const phonesSize = phones.size;
        phones.add(row[phoneNumberIndex]);

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

    let phoneNumberIndex = 0;
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
      console.log(e);
      return 'ERROR';
    }
  }

  //////////////////////////////////////////////////////

  async getData(
    skips: number,
    limits: number,
    filters: any = undefined,
    displayString: string[],
  ) {
    const f: optionalFilter = {};
    if (filters) {
      if (filters.phoneNumber)
        f.phoneNumber = { $regex: RegExp(filters.phoneNumber) };
      if (filters.listTag)
        f.listTag = { $elemMatch: { $regex: RegExp(filters.listTag) } };
      if (filters.carrier && filters.carrier !== 'nullTypeAndCarrier')
        f.carrier = { $regex: RegExp(filters.carrier) };
      else if (filters.carrier === 'nullTypeAndCarrier') {
        f.carrier = null;
        f.type = null;
      }
      if (filters.inBase != undefined) f.inBase = filters.inBase;
    }
    const data = await this.csvModel
      .find(f, {}, { skip: skips, limit: limits })
      .select(displayString);
    return data;
  }

  async exportData(
    filters: any = undefined,
    displayString: string[],
    fileName: string,
  ) {
    const f: optionalFilter = {};
    let limits;
    let count = 0;
    const analis = await this.analisysModel.findOne({
      fileName: { $regex: RegExp(filters.listTag) },
    });
    if (filters) {
      if (filters.phoneNumber)
        f.phoneNumber = { $regex: RegExp(filters.phoneNumber) };
      if (filters.listTag) {
        f.listTag = { $elemMatch: { $regex: RegExp(filters.listTag) } };

        limits = analis.validDataCounter;
      }
      if (filters.carrier && filters.carrier !== 'nullTypeAndCarrier')
        f.carrier = { $regex: RegExp(filters.carrier) };
      else if (filters.carrier === 'nullTypeAndCarrier') {
        f.carrier = null;
        f.type = null;
        if (analis.nullTypeAndCarrier && filters.inBase === false)
          limits = analis.nullTypeAndCarrier;
      }

      if (filters.inBase != undefined) {
        f.inBase = filters.inBase;
        if (analis.duplicateInBase && filters.carrier !== 'nullTypeAndCarrier')
          limits = analis.duplicateInBase;
      }
    }
    this.numberOfExportFileLimit += limits ? limits : 1_000_000;
    const cursor = this.csvModel
      .find(f, {}, { skip: 0, limit: limits ? limits : 1_000_000 })
      .select(displayString)
      .cursor();

    await fsWrite.writeFile(
      `./export/${fileName}.csv`,
      'Phone number,First name, Last name, Carrier, Type\n',
    );
    const newPromise = new Promise((resolve) => {
      cursor
        .on('data', async (data: csvData) => {
          const csvLine = `${data.phoneNumber},${
            data.firstName ? data.firstName : ''
          },${data.lastName ? data.lastName : ''},${
            data.type ? data.type : ''
          },${data.carrier ? data.carrier : ''}`;
          this.numberOfExportFile++;
          count++;
          await fsWrite.appendFile(`./export/${fileName}.csv`, csvLine + '\n');
        })
        .on('end', () => {
          resolve('true');
        });
    });
    await newPromise;
    this.numberOfExportFileLimit -= limits ? limits : 1_000_000;
    this.numberOfExportFile -= count;
    await this.exportModel.updateOne(
      { fileName: fileName },
      {
        dataCounter: count,
        phoneNumber: filters.phoneNumber ? filters.phoneNumber : '',
        listTag: filters.listTag ? filters.listTag : '',
        carrier: filters.carrier ? filters.carrier : '',
        inBase: filters.inBase ? filters.inBase : undefined,
      },
      { upsert: true },
    );
    return newPromise;
  }

  async getDataLenght(filters?: any) {
    const f: optionalFilter = {};
    if (filters) {
      if (filters.phoneNumber)
        f.phoneNumber = { $regex: RegExp(filters.phoneNumber) };
      if (filters.listTag) {
        f.listTag = { $elemMatch: { $regex: RegExp(filters.listTag) } };
      }
      if (filters.carrier && filters.carrier !== 'nullTypeAndCarrier')
        f.carrier = { $regex: RegExp(filters.carrier) };
      else if (filters.carrier === 'nullTypeAndCarrier') {
        f.carrier = null;
        f.type = null;
      }
      if (filters.inBase != undefined) f.inBase = filters.inBase;
    }
    const count = await this.csvModel.count(f);
    const jsonData = JSON.stringify(count);
    return jsonData;
  }
  async getAnalisysValidData(
    fileName: string,
    inBase: boolean | undefined,
    nullTypeAndCarrier: boolean | undefined,
    carrier: string | undefined,
  ) {
    const regexp = RegExp(fileName);
    const analis = await this.analisysModel.findOne({
      fileName: { $regex: regexp },
    });
    let count = 0;
    if (analis) {
      if (inBase) return analis.duplicateInBase;
      if (!!inBase) return analis.validDataCounter - analis.duplicateInBase;
      if (nullTypeAndCarrier) return analis.nullTypeAndCarrier;
      if (
        carrier === availableCarrier.MetroByTMoblie ||
        carrier === availableCarrier.TMobile
      )
        return analis.TMobileCarrier;
      if (
        carrier === availableCarrier.Verizon ||
        carrier === availableCarrier.verisonWireless
      )
        return analis.verisonCarrier;
      if (carrier === availableCarrier.ATT) return analis.ATTCarrier;

      if (inBase && nullTypeAndCarrier) return 0;

      count = analis.validDataCounter;
    }
    return count;
  }

  async getAnalisysData(skips: number, limits: number) {
    const data = await this.analisysModel
      .find({}, {}, { skip: skips, limit: limits })
      .sort({ _id: -1 });
    const jsonData = JSON.stringify(data);
    return jsonData;
  }

  async getListTags() {
    const data = await this.analisysModel
      .find({ fileName: { $ne: 'DBInfo' } }, {}, {})
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
    const deletedNull = await this.csvModel.deleteMany({
      listTag: { $elemMatch: { $regex: reg } },
      carrier: { $in: [null, undefined] },
      type: { $in: [null, undefined] },
    });
    const deleted = await this.csvModel.deleteMany({
      listTag: { $elemMatch: { $regex: reg } },
    });
    const DBInfo = await this.analisysModel.findOne({ fileName: 'DBInfo' });
    try {
      await this.analisysModel.findOneAndUpdate(
        {
          fileName: 'DBInfo',
        },
        {
          $set: {
            validDataCounter: DBInfo.validDataCounter - deleted.deletedCount,
            nullTypeAndCarrier:
              DBInfo.nullTypeAndCarrier - deletedNull.deletedCount,
          },
        },
      );
    } catch (e) {
      console.log(e);
      await this.analisysModel.updateOne(
        {
          fileName: 'DBInfo',
        },
        { $set: { validDataCounter: 0, nullTypeAndCarrier: 0 } },
      );
    }

    return { deletedCount: deleted.deletedCount };
  }

  async detectCarrier(phoneNumber: string) {
    const validPhone = phone(phoneNumber);
    if (validPhone.isValid) {
      phoneNumber = validPhone.phoneNumber.slice(1);
      let forReturn: any;
      this.httpService.axiosRef
        .get(
          `https://i.textyou.online/campaign/nl/v1/enum/lookup?product=Mobius MNP&phone_number=${phoneNumber}`,
          {
            headers: {
              Authorization: 'Bearer ' + process.env.ITEXTYOU_API_KEY,
            },
          },
        )
        .then(async (res) => {
          forReturn = res.data;
          let type = res.data.number_type;
          if (type === 0) {
            type = null;
          } else if (type === 2) {
            type = 'landline';
          } else if (type === 3) {
            type = 'mobile';
          }
          const carrier = res.data.operator_name;

          await this.baseModel.updateOne(
            { phoneNumber: phoneNumber },
            {
              $set: {
                carrier: carrier,
                type: type,
              },
            },
            { upsert: true },
          );
          await this.csvModel.updateOne(
            { phoneNumber: phoneNumber },
            {
              $set: {
                carrier: carrier,
                type: type,
              },
            },
            { upsert: true },
          );
        })
        .catch((err) => {
          console.log(err);
        });
      return forReturn;
    }
  }
  async detectArrayCarrier(filters: allFilter) {
    const forReturn: any = {
      unknown: 0,
      landline: 0,
      mobile: 0,
      invalid: 0,
      canadian: 0,
    };
    const phoneNumbers: string[] = [];
    const nullTypeAndCarrierData = await this.getData(0, 100000, filters, []);
    for (let i = 0; i < nullTypeAndCarrierData.length; i++) {
      phoneNumbers.push(nullTypeAndCarrierData[i].phoneNumber);
    }
    if (phoneNumbers.length > 0) {
      const bulkOps = [];
      const resultProcess = new Promise(async (resolve, reject) => {
        for (let i = 0; i < Math.ceil(phoneNumbers.length / 1000); i++) {
          let end = 0;
          if ((i + 1) * 1000 <= phoneNumbers.length) end = (i + 1) * 1000;
          else end = phoneNumbers.length;
          await this.httpService.axiosRef
            .post(
              'https://i.textyou.online/campaign/nl/v1/enum/lookup',
              {
                product: 'Mobius MNP',
                phone_numbers: phoneNumbers.slice(i * 1000, end),
              },
              {
                headers: {
                  Authorization: 'Bearer ' + process.env.ITEXTYOU_API_KEY,
                  'Content-Type': 'application/json',
                  'Access-Control-Allow-Origin': '*',
                },
              },
            )
            .then(async (res) => {
              for (let i = 0; i < res.data.length; i++) {
                let type = res.data[i].number_type;
                let carrier;
                if (res.data[i].country_iso2 === 'CA') {
                  type = deviceType.invalid;
                  carrier = 'Canadian';
                } else {
                  if (type === 0) {
                    forReturn.unknown++;
                    type = deviceType.unknown;
                  } else if (type === 1) {
                    forReturn.invalid++;
                    type = deviceType.invalid;
                  } else if (type === 2) {
                    forReturn.landline++;
                    type = deviceType.landline;
                  } else if (type === 3) {
                    forReturn.mobile++;
                    type = deviceType.mobile;
                  }
                  carrier = res.data[i].operator_name
                    ? res.data[i].operator_name
                    : deviceType.unknown;
                }

                const filter = { phoneNumber: res.data[i].phone_number };

                const update = { $set: { carrier: carrier, type: type } };

                bulkOps.push({ updateOne: { filter, update, upsert: true } });
              }
              try {
                await this.baseModel.bulkWrite(bulkOps);
                await this.csvModel.bulkWrite(bulkOps);
                resolve(forReturn);
              } catch (e) {
                console.log(e);
                reject(e);
              }
            })
            .catch((err) => {
              console.log(err);
              reject(err);
              throw new HttpException(err, 500);
            });
        }
      });
      await resultProcess;
      return forReturn;
    }
  }

  async fixBrokenLastName() {
    const cursor = this.csvModel
      .find({
        lastName: { $regex: RegExp('\\r') },
      })
      .cursor();

    const bulkOps = [];
    const resultPromise = new Promise((resolve) => {
      cursor
        .on('data', (data) => {
          const newLastName = data.lastName.slice(data.lastName.length - 2, 2);

          const filter = { phoneNumber: data.phoneNumber };

          const update = { $set: { lastName: newLastName } };

          bulkOps.push({
            updateOne: { filter, update, upsert: true },
          });
        })
        .on('end', () => {
          resolve(true);
        });
    });
    await resultPromise;
    const results = await this.csvModel.bulkWrite(bulkOps);
    return results.modifiedCount;
  }

  async fixBrokenCarrierName() {
    const cursor = this.csvModel
      .find({
        carrier: { $regex: RegExp('\\r') },
      })
      .cursor();

    const bulkOps = [];
    const resultPromise = new Promise((resolve) => {
      cursor
        .on('data', (data) => {
          const newCarrier = data.carrier.slice(data.carrier.length - 2, 2);

          const filter = { phoneNumber: data.phoneNumber };

          const update = { $set: { carrier: newCarrier } };

          bulkOps.push({
            updateOne: { filter, update, upsert: true },
          });
        })
        .on('end', () => {
          resolve(true);
        });
    });
    await resultPromise;
    const results = await this.csvModel.bulkWrite(bulkOps);
    return results.modifiedCount;
  }

  async clearBase() {
    const cursor = this.csvModel
      .find({ inBase: true })
      .select(['phoneNumber'])
      .cursor();
    let bulkOps = [];
    let deletedCount = 0;
    const resultPromise = new Promise((resolve) => {
      cursor
        .on('data', async (data) => {
          const filter = { phoneNumber: data.phoneNumber };

          bulkOps.push({ deleteOne: { filter: filter } });
          if (bulkOps.length === 4_000_00) {
            console.log('in');

            this.baseModel.bulkWrite(bulkOps).then((result) => {
              bulkOps = [];
              deletedCount += result.deletedCount;
              cursor.resume();
            });
            cursor.pause();
          }
        })
        .on('end', () => {
          this.baseModel.bulkWrite(bulkOps).then((result) => {
            deletedCount += result.deletedCount;
            resolve(deletedCount);
          });
        });
    });
    return await resultPromise;
  }

  async getExportFiles() {
    const file = await this.exportModel.find({});
    return file;
  }

  async deleteExportFile(fileName: string) {
    const file = await this.exportModel.findOneAndDelete({
      fileName: fileName,
    });
    fs.unlink('./export/' + fileName + '.csv', (err) => {
      if (err) console.log('File not exist');
      console.log(`${fileName}.csv was succefully deleted`);
    });

    return file;
  }

  async getBrokenDataLenght() {
    const carrier = await this.csvModel.count({ carrier: '\\r' });
    const lastName = await this.csvModel.count({ lastName: '\\r' });

    return { brokenCarrier: carrier, brokenLastname: lastName };
  }

  async updateAnalisysCountData() {
    const tags = await this.analisysModel.find({ fileName: { $ne: 'DBInfo' } });
    const result = 'End';
    if (tags.length >= 1) {
      const resultPromise = new Promise(async (resolve) => {
        const tagsCounter = [];
        const allDataCursor = this.csvModel.find({}).cursor();

        allDataCursor
          .on('data', (data) => {
            const tagsSet = new Set<string>();
            const tags = data.listTag;
            for (let i = 0; i < tags.length; i++) {
              const newSize = tagsSet.size;
              tagsSet.add(tags[i]);
              if (newSize !== tagsSet.size) {
                const include = tagsCounter.includes(tags[i]);
                if (!include) {
                  tagsCounter.push(tags[i]);
                  tagsCounter.push({
                    inBaseCount: 0,
                    ATTCount: 0,
                    TMobileCount: 0,
                    VerizonCount: 0,
                    nullTypeAndCarrierCount: 0,
                  });
                }
                const index = tagsCounter.indexOf(tags[i]);

                if (include) {
                  if (data.inBase) {
                    tagsCounter[index + 1].inBaseCount++;
                  }
                  if (
                    data.carrier === availableCarrier.TMobile ||
                    data.carrier === availableCarrier.MetroByTMoblie
                  ) {
                    tagsCounter[index + 1].TMobileCount++;
                  }
                  if (data.carrier === availableCarrier.ATT) {
                    tagsCounter[index + 1].ATTCount++;
                  }
                  if (
                    data.carrier === availableCarrier.Verizon ||
                    data.carrier === availableCarrier.verisonWireless
                  ) {
                    tagsCounter[index + 1].VerizonCount++;
                  }
                  if (
                    (data.carrier === undefined || data.carrier === null) &&
                    (data.type === undefined || data.type === null)
                  ) {
                    tagsCounter[index + 1].nullTypeAndCarrierCount++;
                  }
                }
              }
            }
          })
          .on('end', async () => {
            for (let i = 0; i < tagsCounter.length; i += 2) {
              await this.analisysModel.findOneAndUpdate(
                {
                  fileName: tagsCounter[i],
                },
                {
                  $set: {
                    duplicateInBase: tagsCounter[i + 1].inBaseCount,
                    TMobileCarrier: tagsCounter[i + 1].TMobileCount,
                    ATTCarrier: tagsCounter[i + 1].ATTCount,
                    verisonCarrier: tagsCounter[i + 1].VerizonCount,
                    nullTypeAndCarrier:
                      tagsCounter[i + 1].nullTypeAndCarrierCount,
                  },
                },
                { upsert: true },
              );
              resolve('true');
            }
          });
      });
      await resultPromise;
      return result;
    }
  }

  async setCountNullTypeAndCarrier() {
    const dataCursor = this.csvModel.find({}).cursor();
    const allDataCount = await this.csvModel.count();
    let csvNullCarrierAndType = 0;
    let csvInBase = 0;
    let ATTCount = 0;
    let TMobileCount = 0;
    let verizonCount = 0;
    const result = 'Done';
    const resultPromise = new Promise((resolve) => {
      dataCursor
        .on('data', (data) => {
          if (
            (data.carrier === null || data.carrier === undefined) &&
            (data.type === null || data.type === undefined)
          ) {
            csvNullCarrierAndType++;
          } else if (
            data.carrier === 'T-Mobile' ||
            data.carrier === 'Metro by T-Mobile'
          )
            TMobileCount++;
          else if (data.carrier === 'AT&T') ATTCount++;
          else if (
            data.carrier === 'Verizon' ||
            data.carrier === 'Verizon Wireless'
          )
            verizonCount++;
          if (data.inBase === true) {
            csvInBase++;
          }
        })
        .on('end', async () => {
          await this.analisysModel.updateOne(
            { fileName: 'DBInfo' },
            {
              $set: {
                validDataCounter: allDataCount,
                duplicateInMongo: 0,
                duplicateInBase: csvInBase,
                badDataCounter: 0,
                duplicateInFile: 0,
                nullTypeAndCarrier: csvNullCarrierAndType,
                ATTCarrier: ATTCount,
                TMobileCarrier: TMobileCount,
                verisonCarrier: verizonCount,
              },
            },
            { upsert: true },
          );
          resolve('Done');
        });
    });
    await resultPromise;
    return result;
  }

  async checkAnalisys(fileName: string) {
    const analisys = await this.analisysModel.findOne({
      fileName: { $regex: RegExp(fileName) },
    });
    if (analisys) return true;
    else return false;
  }

  async getSpecificTag(fileName: string) {
    const analis = await this.analisysModel.find({ fileName: fileName });
    if (analis) {
      return analis;
    } else {
      throw new HttpException('File not found', HttpStatus.BAD_REQUEST);
    }
  }

  async checkCanadianNumber() {
    const cursor = this.csvModel.find({}).cursor();
    const bulkOps = [];
    let canadian = 0;
    const resultPromise = new Promise(async (resolve) => {
      cursor
        .on('data', async (data) => {
          const detail = phone(data.phoneNumber);
          console.log(data.carrier);
          if (detail.countryIso2 === 'CA' && data.carrier !== 'canadian') {
            const filter = { phoneNumber: data.phoneNumber };

            const update = {
              $set: { carrier: 'canadian', type: deviceType.invalid },
            };

            bulkOps.push({ updateOne: { filter, update, upsert: true } });
            if (bulkOps.length === 1_000_00)
              await this.csvModel.bulkWrite(bulkOps).then((data) => {
                canadian += data.modifiedCount;
              });
          }
        })
        .on('end', async () => {
          await this.csvModel.bulkWrite(bulkOps).then((data) => {
            canadian += data.modifiedCount;
          });

          console.log('done');

          resolve(canadian);
        });
    });
    await resultPromise;
    return canadian;
  }
}
