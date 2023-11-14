export class CsvInsertDto {
  phoneNumber: string;

  firstName: string;

  lastName: string;

  carrier: string;

  listTag: string;
}

export const validatePhone = (phone: string) => {
  if (phone.length < 10 || phone.length > 11) return false;
  const patternWithUSCode = new RegExp(
    '^1[2-9]{1}[0-9]{2}[2-9]{1}[0-9]{2}[0-9]{4}$',
  );
  const patternWithoutUSCode = new RegExp(
    '^[2-9]{1}[0-9]{2}[2-9]{1}[0-9]{2}[0-9]{4}$',
  );
  if (!patternWithUSCode.test(phone) && !patternWithoutUSCode.test(phone))
    return false;
  return true;
};
