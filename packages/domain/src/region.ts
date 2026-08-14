interface RegionAlias {
  region: string;
  aliases: readonly string[];
}

const provinceAliases: readonly RegionAlias[] = [
  { region: '서울특별시', aliases: ['서울특별시', '서울시'] },
  { region: '부산광역시', aliases: ['부산광역시', '부산시'] },
  { region: '대구광역시', aliases: ['대구광역시', '대구시'] },
  { region: '인천광역시', aliases: ['인천광역시', '인천시'] },
  { region: '광주광역시', aliases: ['광주광역시'] },
  { region: '대전광역시', aliases: ['대전광역시', '대전시'] },
  { region: '울산광역시', aliases: ['울산광역시', '울산시'] },
  { region: '세종특별자치시', aliases: ['세종특별자치시', '세종시'] },
  { region: '경기도', aliases: ['경기도'] },
  { region: '강원특별자치도', aliases: ['강원특별자치도', '강원도'] },
  { region: '충청북도', aliases: ['충청북도', '충북'] },
  { region: '충청남도', aliases: ['충청남도', '충남'] },
  { region: '전북특별자치도', aliases: ['전북특별자치도', '전라북도', '전북'] },
  { region: '전라남도', aliases: ['전라남도', '전남'] },
  { region: '경상북도', aliases: ['경상북도', '경북'] },
  { region: '경상남도', aliases: ['경상남도', '경남'] },
  { region: '제주특별자치도', aliases: ['제주특별자치도', '제주도'] },
];

const municipalityParents: Readonly<Record<string, string>> = {
  수원시: '경기도 수원시',
  용인시: '경기도 용인시',
  화성시: '경기도 화성시',
  여주시: '경기도 여주시',
  김포시: '경기도 김포시',
  부천시: '경기도 부천시',
  성남시: '경기도 성남시',
  분당구: '경기도 성남시 분당구',
  안양시: '경기도 안양시',
  서대문구: '서울특별시 서대문구',
  안동시: '경상북도 안동시',
  영주시: '경상북도 영주시',
  정선군: '강원특별자치도 정선군',
};

// Some cup names omit the administrative suffix. Keep these aliases conservative and auditable.
const suffixlessAliases: readonly RegionAlias[] = [
  { region: '경기도 용인시', aliases: ['용인'] },
  { region: '경기도 화성시', aliases: ['화성'] },
  { region: '경기도 수원시', aliases: ['수원'] },
  { region: '경기도 여주시', aliases: ['여주'] },
  { region: '경기도 김포시', aliases: ['김포'] },
  { region: '경상북도 안동시', aliases: ['안동'] },
  { region: '경상북도 영주시', aliases: ['영주'] },
  { region: '강원특별자치도 정선군', aliases: ['정선'] },
];

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
const provincePattern = new RegExp(
  provinceAliases.flatMap(({ aliases }) => aliases).sort((left, right) => right.length - left.length).map(escapeRegExp).join('|'),
  'u',
);
const subdivisionPattern = /(?:^|[\s()[\]{}·,/_-])([가-힣]{1,8}?(?:특례시|시|군|구))(?=\s|탁구|체육|협회|연합|의회|청|장|민|배|대회|$)/gu;
const nonAdministrativeSuffixes = /(?:탁구|축구|농구|야구|배구|연구|기구|도구|가구)$/u;

function canonicalProvince(value: string): string {
  return provinceAliases.find(({ aliases }) => aliases.includes(value))?.region ?? value;
}

function canonicalSubdivision(value: string): string {
  return value.endsWith('특례시') ? `${value.slice(0, -3)}시` : value;
}

function extractSubdivision(value: string): string | undefined {
  for (const match of value.matchAll(subdivisionPattern)) {
    const candidate = match[1];
    if (candidate && !nonAdministrativeSuffixes.test(candidate)) return canonicalSubdivision(candidate);
  }
  return undefined;
}

export function inferKoreanRegion(...evidence: Array<string | undefined>): string | undefined {
  const normalizedEvidence = evidence
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
    .normalize('NFKC')
    .replace(/\s+/gu, ' ')
    .trim();
  if (!normalizedEvidence) return undefined;

  const provinceMatch = provincePattern.exec(normalizedEvidence);
  const province = provinceMatch?.[0] ? canonicalProvince(provinceMatch[0]) : undefined;
  const withoutProvince = provinceMatch
    ? `${normalizedEvidence.slice(0, provinceMatch.index)} ${normalizedEvidence.slice(provinceMatch.index + provinceMatch[0].length)}`.trim()
    : normalizedEvidence;
  const subdivision = extractSubdivision(withoutProvince);

  if (province && subdivision) return `${province} ${subdivision}`;
  if (subdivision) return municipalityParents[subdivision] ?? subdivision;
  if (province) return province;

  const compactEvidence = normalizedEvidence.replace(/\s+/gu, '');
  return suffixlessAliases.find(({ aliases }) => aliases.some((alias) => compactEvidence.includes(alias)))?.region;
}
