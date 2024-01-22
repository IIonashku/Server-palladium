import { deviceType } from './csv.types';

export type csvResultData = {
  phoneNumber: string;
  firstName: string;
  lastName: string;
  carrier: string;
  type: deviceType;
  listTag: string[];
  inBase: boolean;
};

export type analisysResultData = {
  fileName: string;
  duplicateInFile: number;
  duplicateInMongo: number;
  duplicateInBase: number;
  badDataCounter: number;
  validDataCounter: number;
  nullTypeAndCarrier: number;
  ATTCarrier: number;
  TMobileCarrier: number;
  verizonCarrier: number;
};

export type exportResultData = {
  fileName: string;
  dataCounter: number;
  // filter
  listTag: string;
  carrier: string;
  phoneNumber: string;
  inBase: string;
};

export type apiResult = {
  landline: number;
  mobile: number;
  unknown: number;
  invalid: number;
  canadian: number;
};
export type fileUploadResult = {
  filename: string;
  file?: fileResult;
  error?: fileError;
};

type fileResult = {
  duplicateInFile: number;
  duplicateInMongo: number;
  duplicateInBase: number;
  badDataCounter: number;
  validDataCounter: number;
  nullTypeAndCarrier: number;
  ATTCarrier: number;
  TMobileCarrier: number;
  verizonCarrier: number;
};

type fileError = {
  error: string;
  message: string;
};
