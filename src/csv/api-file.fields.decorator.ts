import { UseInterceptors, applyDecorators } from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import {
  MulterField,
  MulterOptions,
} from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import { ApiBody, ApiConsumes } from '@nestjs/swagger';
import {
  ReferenceObject,
  SchemaObject,
} from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import { ApiFiles } from './api-files.decorator';
import { diskStorage } from 'multer';

export type UploadedFields = MulterField & { required?: boolean };

export function ApiFileFields(
  uploadFields: UploadedFields[],
  localOptions?: MulterOptions,
) {
  const bodyProperties: Record<string, SchemaObject | ReferenceObject> =
    Object.assign(
      {},
      ...uploadFields.map((field) => {
        return { [field.name]: { type: 'string', format: 'binary' } };
      }),
    );
  const apiBody = ApiBody({
    schema: {
      type: 'object',
      properties: bodyProperties,
      required: uploadFields.filter((f) => f.required).map((f) => f.name),
    },
  });
  return applyDecorators(
    UseInterceptors(FileFieldsInterceptor(uploadFields, localOptions)),
    ApiConsumes('multipart/form-data'),
    apiBody,
  );
}

export function ApiCsvFiles(
  fileName: string = 'csv',
  required: boolean = false,
  maxCount: number = 10,
) {
  return ApiFiles(fileName, required, maxCount, {
    storage: diskStorage({
      destination: './csvs',
      filename: (req, file, cb) => {
        cb(null, `${file.originalname}`);
      },
    }),
    fileFilter: function (req, file, cb) {
      file.mimetype === 'text/csv' ? cb(null, true) : cb(null, false);
    },
  });
}
