const playerNamePattern = /^[\p{L}\p{M}]+(?:[ .\u00b7'’-][\p{L}\p{M}]+){0,3}$/u;
const strongAddressPattern = /(?:특별시|광역시|특별자치(?:시|도))/u;
const regionTokenPattern =
  /^(?:서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)(?:도)?$/u;
const addressSuffixTokenPattern =
  /[가-힣]{2,}(?:도|시|군|구|읍|면|동|리|로|길)$/u;

export function isSafeIpingPlayerName(value: string): boolean {
  const normalized = value.normalize("NFKC").trim();
  const length = [...normalized].length;
  const addressTokenCount = normalized
    .split(/\s+/u)
    .filter(
      (token) =>
        regionTokenPattern.test(token) || addressSuffixTokenPattern.test(token),
    ).length;
  return (
    length >= 2 &&
    length <= 30 &&
    playerNamePattern.test(normalized) &&
    !strongAddressPattern.test(normalized) &&
    addressTokenCount < 2
  );
}
