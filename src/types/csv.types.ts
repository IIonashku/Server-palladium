export enum deviceType {
  mobile = 'mobile',
  landline = 'landline',
  unknown = 'unknown',
  invalid = 'invalid',
  canadian = 'canadian',
}

export enum availableCarrier {
  TMobile = 'T-Mobile',
  MetroByTMoblie = 'Metro by T-Mobile',
  Verizon = 'Verizon',
  ATT = 'AT&T',
  verisonWireless = 'Verizon Wireless',
}

export type analisysCreateSchema = {
  fileName: string;
  duplicateInFile: number;
  duplicateInMongo: number;
  duplicateInBase: number;
  badDataCounter: number;
  validDataCounter: number;
  nullTypeAndCarrier: number;
  ATTCarrier: number;
  TMobileCarrier: number;
  verisonCarrier: number;
};

export type analisysUpdateSchema = {
  duplicateInBase: number;
  validDataCounter: number;
  nullTypeAndCarrier: number;
  ATTCarrier: number;
  TMobileCarrier: number;
  verisonCarrier: number;
};

export type csvCreateSchema = {
  phoneNumber: string;
  firstName: string;
  lastName: string;
  carrier: string;
  type: deviceType;
  listTag: string[];
  inBase: boolean;
};

export type csvUpdateSchema = {
  firstName: string;
  lastName: string;
  carrier: string;
  type: deviceType;
  inBase: boolean;
};

export type csvCheckDataSchema = {
  carrier: string;
  type: deviceType;
  inBase: boolean;
};

export type csvUpdateCarrierSchema = {
  carrier: string;
  type: deviceType;
};

export type csvCheckListTagSchema = {
  carrier: string;
  type: deviceType;
  inBase: boolean;
  listTag: string[];
};

export type apiCarrierResult = {
  phone_number: string;
  country_iso2: string;
  number_type: number;
  operator_name: string;
};

export type csvData = {
  phoneNumber: string;
  firstName: string;
  lastName: string;
  carrier: string;
  type: string;
  listTag: string;
};
