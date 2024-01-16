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
import { CsvInsertDto } from './main/csv.dto';
import { Analisys } from './analisys/csv.analisys.schema';
import { Basecsv } from './base/base.csv.schema';
import { HttpService } from '@nestjs/axios';
import { fileReaded, numOfFile } from './csv.controller';
import * as fsWrite from 'node:fs/promises';
import { Export } from './export/export.schema';
import {
  analisysCreateSchema,
  apiCarrierResult,
  availableCarrier,
  csvCheckDataSchema,
  csvCheckListTagSchema,
  csvData,
  csvUpdateCarrierSchema,
  deviceType,
} from 'src/types/csv.types';
import { AxiosResponse } from 'axios';
import {
  analisysResultData,
  apiResult,
  csvResultData,
} from 'src/types/csv.controller.result.types';

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

  async saveDataToDB(
    data: CsvInsertDto[],
    phones: string[],
    fileName: string,
    modelCsv: Model<Csv>,
    modelBase: Model<Basecsv>,
    analisysModel: Model<Analisys>,
  ): Promise<Partial<analisysResultData>> {
    const result: Partial<analisysResultData> = {
      ATTCarrier: 0,
      TMobileCarrier: 0,
      verizonCarrier: 0,
      duplicateInMongo: 0,
      duplicateInBase: 0,
      validDataCounter: data.length,
    };

    try {
      await modelCsv.insertMany(data, {
        ordered: false,
      });
    } catch (e) {
      if (e.code === 11000) {
        const csvIds = await e.result.result.writeErrors.map((error) => {
          return error.err.op.phoneNumber;
        });
        result.duplicateInMongo = await csvIds.length;
        await modelCsv.updateMany(
          { phoneNumber: { $in: csvIds } },
          { $push: { listTag: fileName } },
        );
      }
    }

    try {
      const finded: csvResultData[] = await modelBase.find(
        { phoneNumber: { $in: phones } },
        { _id: false, __v: false },
      );
      const bulkOps = [];
      result.duplicateInBase = finded.length;
      for (let i = 0; i < finded.length; i++) {
        if (
          finded[i].carrier === availableCarrier.TMobile ||
          finded[i].carrier === availableCarrier.MetroByTMoblie
        )
          result.TMobileCarrier++;
        else if (
          finded[i].carrier === availableCarrier.Verizon ||
          finded[i].carrier === availableCarrier.verizonWireless
        )
          result.verizonCarrier++;
        else if (finded[i].carrier === availableCarrier.ATT)
          result.ATTCarrier++;
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
            result.duplicateInMongo,
        },
      },
      { upsert: true },
    );

    return result;
  }

  async readFile(
    fileName: string,
    method: string,
  ): Promise<analisysCreateSchema> {
    this.getCountOfLine(fileName);

    let data: CsvInsertDto[] = [];
    let uploadingphones = [];
    const resultInfo: analisysCreateSchema = {
      fileName: fileName,
      duplicateInFile: 0,
      duplicateInMongo: 0,
      badDataCounter: 0,
      duplicateInBase: 0,
      nullTypeAndCarrier: 0,
      TMobileCarrier: 0,
      ATTCarrier: 0,
      verizonCarrier: 0,
      validDataCounter: 0,
    };

    const model = this.csvModel;
    const modelBase = this.baseModel;
    const analisysModel = this.analisysModel;
    const phones = new Set();

    const csvStream = await this.createStream(fileName);
    let saver = this.saveDataToDB;
    if (method === 'update') {
      saver = this.updateDataToDB;
    }
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
          data.push(element);
          if (element.type === undefined && element.carrier === null)
            resultInfo.nullTypeAndCarrier++;
          uploadingphones.push(row[phoneNumberIndex]);
          if (data.length === Math.floor(500_000 / numOfFile)) {
            this.numberOfUploadedData += Math.floor(500_000 / numOfFile);
            resultInfo.validDataCounter += data.length;
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
              resultInfo.ATTCarrier += res.ATTCarrier;
              resultInfo.verizonCarrier += res.verizonCarrier;
              resultInfo.TMobileCarrier += res.TMobileCarrier;
              parser.resume();
            });
            parser.pause();

            data = [];
            uploadingphones = [];
          }
        } else {
          resultInfo.duplicateInFile += 1;
        }
      } else {
        resultInfo.badDataCounter += 1;
      }
    };
    /////////////////////////////////////////////////////////////
    let phoneNumberIndex = 0;
    let firstNameIndex = 10;
    let lastNameIndex = 10;
    let typeIndex = 10;
    let carrierIndex = 10;

    const result = await new Promise<analisysCreateSchema>(
      async (resolve, reject) => {
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
                resultInfo.ATTCarrier += res.ATTCarrier;
                resultInfo.verizonCarrier += res.verizonCarrier;
                resultInfo.TMobileCarrier += res.TMobileCarrier;
              });
              resultInfo.validDataCounter += data.length;
              fileReaded();
              resolve(resultInfo);
            })
            .on('error', function (error) {
              reject(error);
            }),
        );
      },
    );
    return await result;
  }

  //////////////////////////////////////////////////////

  async updateDataToDB(
    chunk: CsvInsertDto[],
    phones: string[],
    fileName: string,
    modelCsv: Model<Csv>,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    modelBase: Model<Basecsv>,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    analisysModel: Model<Analisys>,
  ): Promise<Partial<analisysResultData>> {
    const bulkOps = [];
    const result: Partial<analisysResultData> = {
      fileName: fileName,
      TMobileCarrier: 0,
      ATTCarrier: 0,
      verizonCarrier: 0,
      duplicateInMongo: 0,
    };
    try {
      for (let i = 0; i < chunk.length; i++) {
        const filter = { phoneNumber: chunk[i].phoneNumber };
        const update = {
          $set: {
            firstName: chunk[i].firstName,
            lastName: chunk[i].lastName,
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
      }
      await modelCsv.bulkWrite(bulkOps).then((res) => {
        result.duplicateInMongo = res.modifiedCount;
      });
      return result;
    } catch (e) {
      throw new InternalServerErrorException(e);
    }
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

  async saveAnalisys(analisys: Partial<analisysCreateSchema>, method: string) {
    try {
      if (method === 'upload') {
        const newAnalisys = new this.analisysModel({
          fileName: analisys.fileName,
          badDataCounter: analisys.badDataCounter,
          validDataCounter: analisys.validDataCounter,
          duplicateInBase: analisys.duplicateInBase,
          duplicateInFile: analisys.duplicateInFile,
          duplicateInMongo: analisys.duplicateInMongo,
          ATTCarrier: analisys.ATTCarrier,
          TMobileCarrier: analisys.TMobileCarrier,
          nullTypeAndCarrier: analisys.nullTypeAndCarrier,
          verizonCarrier: analisys.verizonCarrier,
        });
        return await newAnalisys.save();
      } else if (method === 'update') {
        const finded = await this.analisysModel.findOne({
          fileName: analisys.fileName,
        });
        if (finded) {
          analisys.duplicateInBase = finded.duplicateInBase;
          analisys.TMobileCarrier = finded.TMobileCarrier;
          analisys.verizonCarrier = finded.verizonCarrier;
          analisys.ATTCarrier = finded.ATTCarrier;
        }
        return await this.analisysModel.updateOne(
          {
            fileName: analisys.fileName,
          },
          {
            $setOnInsert: {
              badDataCounter: analisys.badDataCounter,
              validDataCounter: analisys.validDataCounter,
              duplicateInFile: analisys.duplicateInFile,
              duplicateInMongo: analisys.duplicateInMongo,
              duplicateInBase: 0,
            },
          },
        );
      }
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
    return await this.csvModel.count(f);
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
        carrier === availableCarrier.verizonWireless
      )
        return analis.verizonCarrier;
      if (carrier === availableCarrier.ATT) return analis.ATTCarrier;

      if (inBase && nullTypeAndCarrier) return 0;

      count = analis.validDataCounter;
    }
    return count;
  }

  async getAnalisysData(skips: number, limits: number) {
    return await this.analisysModel
      .find({}, {}, { skip: skips, limit: limits })
      .sort({ _id: -1 });
  }

  async getListTags() {
    return await this.analisysModel
      .find({ fileName: { $ne: 'DBInfo' } }, {}, {})
      .select(['fileName', 'validDataCounter']);
  }

  async getAnalisysDataLenght() {
    return await this.analisysModel.count({});
  }

  async deleteAnalisys(fileName: string) {
    const deleted = await this.analisysModel.findOneAndDelete({
      fileName: fileName,
    });
    const reg = RegExp(fileName);

    const deletedData = await this.csvModel.deleteMany({
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
            validDataCounter:
              DBInfo.validDataCounter - deletedData.deletedCount,
            nullTypeAndCarrier:
              DBInfo.nullTypeAndCarrier - deleted.nullTypeAndCarrier,
            ATTCarrier: DBInfo.ATTCarrier - deleted.ATTCarrier,
            TMobileCarrier: DBInfo.TMobileCarrier - deleted.TMobileCarrier,
            verizonCarrier: DBInfo.verizonCarrier - deleted.verizonCarrier,
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

    return { deletedCount: deleted.validDataCounter, deletedFile: deleted };
  }

  async detectCarrier(phoneNumber: string) {
    const validPhone = phone(phoneNumber);
    if (validPhone.isValid) {
      phoneNumber = validPhone.phoneNumber.slice(1);
      const carrierToUpdate: csvUpdateCarrierSchema = {
        type: deviceType.unknown,
        carrier: 'Unknown',
      };
      this.httpService.axiosRef
        .get(
          `https://i.textyou.online/campaign/nl/v1/enum/lookup?product=Mobius MNP&phone_number=${phoneNumber}`,
          {
            headers: {
              Authorization: 'Bearer ' + process.env.ITEXTYOU_API_KEY,
            },
          },
        )
        .then(async (res: AxiosResponse<apiCarrierResult>) => {
          if (res.data.country_iso2 === 'CA') {
            carrierToUpdate.type = deviceType.invalid;
            carrierToUpdate.carrier = 'Canadian';
          } else {
            if (res.data.number_type === 0) {
              carrierToUpdate.type = deviceType.unknown;
            } else if (res.data.number_type === 1) {
              carrierToUpdate.type = deviceType.invalid;
            } else if (res.data.number_type === 2) {
              carrierToUpdate.type = deviceType.landline;
            } else if (res.data.number_type === 3) {
              carrierToUpdate.type = deviceType.mobile;
            }
            carrierToUpdate.carrier = res.data.operator_name
              ? res.data.operator_name
              : deviceType.unknown;
          }

          await this.baseModel.updateOne(
            { phoneNumber: phoneNumber },
            {
              $setOnInsert: { carrierToUpdate },
            },
            { upsert: true },
          );
          await this.csvModel.updateOne(
            { phoneNumber: phoneNumber },
            {
              $setOnInsert: { carrierToUpdate },
            },
            { upsert: true },
          );
        })
        .catch((err) => {
          console.log(err);
        });
      return carrierToUpdate;
    }
  }
  async detectArrayCarrier(filters: allFilter): Promise<apiResult> {
    const forReturn: apiResult = {
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
            .then(async (res: AxiosResponse<apiCarrierResult[]>) => {
              for (let i = 0; i < res.data.length; i++) {
                const carrierToUpdate: csvUpdateCarrierSchema = {
                  type: deviceType.unknown,
                  carrier: 'Unknown',
                };

                if (res.data[i].country_iso2 === 'CA') {
                  carrierToUpdate.type = deviceType.invalid;
                  carrierToUpdate.carrier = 'Canadian';
                } else {
                  if (res.data[i].number_type === 0) {
                    forReturn.unknown++;
                    carrierToUpdate.type = deviceType.unknown;
                  } else if (res.data[i].number_type === 1) {
                    forReturn.invalid++;
                    carrierToUpdate.type = deviceType.invalid;
                  } else if (res.data[i].number_type === 2) {
                    forReturn.landline++;
                    carrierToUpdate.type = deviceType.landline;
                  } else if (res.data[i].number_type === 3) {
                    forReturn.mobile++;
                    carrierToUpdate.type = deviceType.mobile;
                  }
                  carrierToUpdate.carrier = res.data[i].operator_name
                    ? res.data[i].operator_name
                    : deviceType.unknown;
                }

                const filter = { phoneNumber: res.data[i].phone_number };

                const update = {
                  $set: {
                    carrier: carrierToUpdate.carrier,
                    type: carrierToUpdate.type,
                  },
                };

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
        .on('data', (data: csvData) => {
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
        carrier: { $regex: RegExp('\\') },
      })
      .cursor();

    const bulkOps = [];
    const resultPromise = new Promise((resolve) => {
      cursor
        .on('data', (data: csvData) => {
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

  async clearBase(): Promise<number> {
    const cursor = this.csvModel
      .find({ inBase: true })
      .select(['phoneNumber'])
      .cursor();
    let bulkOps = [];
    let deletedCount = 0;
    const resultPromise = new Promise<number>((resolve) => {
      cursor
        .on('data', async (data: csvData) => {
          const filter = { phoneNumber: data.phoneNumber };

          bulkOps.push({ deleteOne: { filter: filter } });
          if (bulkOps.length === 4_000_00) {
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
    const carrier = await this.csvModel.count({ carrier: '\\' });
    const lastName = await this.csvModel.count({ lastName: '\\' });

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
          .on('data', (data: csvCheckListTagSchema) => {
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
                    data.carrier === availableCarrier.verizonWireless
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
                  $setOnInsert: {
                    duplicateInBase: tagsCounter[i + 1].inBaseCount,
                    TMobileCarrier: tagsCounter[i + 1].TMobileCount,
                    ATTCarrier: tagsCounter[i + 1].ATTCount,
                    verizonCarrier: tagsCounter[i + 1].VerizonCount,
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
    const result: analisysResultData = {
      fileName: 'DBInfo',
      nullTypeAndCarrier: 0,
      duplicateInBase: 0,
      ATTCarrier: 0,
      TMobileCarrier: 0,
      verizonCarrier: 0,
      validDataCounter: 0,
      duplicateInMongo: 0,
      duplicateInFile: 0,
      badDataCounter: 0,
    };
    const resultPromise = new Promise<analisysResultData>((resolve) => {
      dataCursor
        .on('data', (data: csvCheckDataSchema) => {
          result.validDataCounter++;
          if (
            (data.carrier === null || data.carrier === undefined) &&
            (data.type === null || data.type === undefined)
          ) {
            result.nullTypeAndCarrier++;
          } else if (
            data.carrier === availableCarrier.TMobile ||
            data.carrier === availableCarrier.MetroByTMoblie
          )
            result.TMobileCarrier++;
          else if (data.carrier === availableCarrier.ATT) result.ATTCarrier++;
          else if (
            data.carrier === availableCarrier.Verizon ||
            data.carrier === availableCarrier.verizonWireless
          )
            result.verizonCarrier++;
          if (data.inBase === true) {
            result.duplicateInBase++;
          }
        })
        .on('end', async () => {
          await this.analisysModel.updateOne(
            { fileName: 'DBInfo' },
            {
              $set: { result },
              $setOnInsert: { result },
            },
            { upsert: true },
          );
          resolve(result);
        });
    });
    return await resultPromise;
  }

  async checkAnalisys(fileName: string) {
    const analisys = await this.analisysModel.findOne({
      fileName: { $regex: RegExp(fileName) },
    });
    if (analisys) return true;
    else return false;
  }

  async getSpecificTag(fileName: string) {
    const analis = await this.analisysModel.findOne({ fileName: fileName });
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
        .on('data', async (data: csvData) => {
          const detail = phone(data.phoneNumber);
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
          resolve(canadian);
        });
    });
    await resultPromise;
    return canadian;
  }
}
