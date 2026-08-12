import { describe, expect, it } from 'vitest';
import iconv from 'iconv-lite';
import { decodeIpingHtml, encodeIpingForm, encodeIpingFormComponent } from './encoding';

describe('iPing CP949 encoding', () => {
  it('encodes Korean search terms with the legacy bytes expected by iPing', () => {
    expect(encodeIpingFormComponent('홍라켓')).toBe('%C8%AB%B6%F3%C4%CF');
    expect(encodeIpingForm({ pg: 'Search', SchVal: '홍라켓' })).toBe('pg=Search&SchVal=%C8%AB%B6%F3%C4%CF');
  });

  it('decodes CP949 HTML bytes', () => {
    expect(decodeIpingHtml(iconv.encode('<title>아이핑검색</title>', 'cp949'))).toBe('<title>아이핑검색</title>');
  });
});
