import { UnsupportedMediaTypeException } from '@nestjs/common';

export function fileTypeFilter(...types: string[]) {
  return (
    req,
    file: Express.Multer.File,
    callback: (error: Error | null, acceptFile: boolean) => void,
  ) => {
    if (types.some((m) => file.mimetype.includes(m))) {
      callback(null, true);
    } else {
      callback(
        new UnsupportedMediaTypeException(
          `File type is not matching: ${types.join(', ')}`,
        ),
        false,
      );
    }
  };
}
