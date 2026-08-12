import iconv from 'iconv-lite';

const unescapedByte = /^[A-Za-z0-9_.~-]$/u;

export function encodeIpingFormComponent(value: string): string {
  return [...iconv.encode(value, 'cp949')]
    .map((byte) => {
      const character = String.fromCharCode(byte);
      return unescapedByte.test(character) ? character : `%${byte.toString(16).toUpperCase().padStart(2, '0')}`;
    })
    .join('');
}

export function encodeIpingForm(fields: Readonly<Record<string, string>>): string {
  return Object.entries(fields)
    .map(([key, value]) => `${encodeIpingFormComponent(key)}=${encodeIpingFormComponent(value)}`)
    .join('&');
}

export function decodeIpingHtml(bytes: Uint8Array): string {
  return iconv.decode(bytes, 'cp949');
}
