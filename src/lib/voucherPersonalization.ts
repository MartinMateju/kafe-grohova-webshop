import type { CartLineAttribute } from './shopify/types';

export const VOUCHER_RECIPIENT_KEY = 'Obdarovaný';
export const VOUCHER_DEDICATION_KEY = 'Věnování';
export const VOUCHER_RECIPIENT_MAX_LENGTH = 100;
export const VOUCHER_DEDICATION_MAX_LENGTH = 500;

/** Only these customer-supplied fields belong on a manually issued voucher. */
export function normalizeVoucherAttributes(attributes: unknown): CartLineAttribute[] {
  if (!Array.isArray(attributes)) throw new Error('Enter the voucher recipient name.');
  const values = new Map<string, string>();
  for (const attribute of attributes) {
    if (!attribute || ![VOUCHER_RECIPIENT_KEY, VOUCHER_DEDICATION_KEY].includes(attribute.key)) continue;
    if (values.has(attribute.key) || typeof attribute.value !== 'string') {
      throw new Error('The voucher details are invalid. Please enter them again.');
    }
    values.set(attribute.key, attribute.value.trim());
  }
  const recipient = values.get(VOUCHER_RECIPIENT_KEY) ?? '';
  const dedication = values.get(VOUCHER_DEDICATION_KEY) ?? '';
  if (!recipient) throw new Error('Enter the voucher recipient name.');
  if (recipient.length > VOUCHER_RECIPIENT_MAX_LENGTH || /[\x00-\x1f\x7f]/.test(recipient)) {
    throw new Error('Use a recipient name of up to 100 characters on one line.');
  }
  if (dedication.length > VOUCHER_DEDICATION_MAX_LENGTH || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(dedication)) {
    throw new Error('Use a dedication of up to 500 characters.');
  }
  return [
    { key: VOUCHER_RECIPIENT_KEY, value: recipient },
    ...(dedication ? [{ key: VOUCHER_DEDICATION_KEY, value: dedication }] : []),
  ];
}

export function createVoucherAttributes(recipient: string, dedication = ''): CartLineAttribute[] {
  return normalizeVoucherAttributes([
    { key: VOUCHER_RECIPIENT_KEY, value: recipient },
    { key: VOUCHER_DEDICATION_KEY, value: dedication },
  ]);
}
