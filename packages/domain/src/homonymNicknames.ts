export const homonymNicknameMinLength = 2;
export const homonymNicknameMaxLength = 20;

export const homonymNicknameSuggestions = [
  "파워 드라이브 전문가",
  "루프 드라이브 최강자",
  "백드라이브 마스터",
  "아마추어 최강",
  "치키타 장인",
  "스매시 해결사",
  "커트 수비왕",
  "블록의 달인",
  "서브 에이스",
  "리시브 장인",
  "랠리 지배자",
  "포핸드 스페셜리스트",
  "백핸드 고수",
  "톱스핀 마스터",
  "백스핀 전략가",
  "사이드스핀 마법사",
  "카운터 드라이브",
  "플릭 스페셜리스트",
  "쇼트 플레이 장인",
  "로빙 수비수",
  "드롭샷 장인",
  "3구 공격수",
  "5구 승부사",
  "듀스 승부사",
  "엣지의 요정",
  "네트의 마법사",
  "회전 맛집",
  "랠리 좀비",
  "탁구대 지휘자",
  "백핸드 불도저",
] as const;

export function pickHomonymNicknameSuggestion(
  excluded: readonly string[] = [],
  randomValue = Math.random(),
): string {
  const normalizedExcluded = new Set(
    excluded.map((nickname) =>
      normalizeHomonymNickname(nickname).toLocaleLowerCase("ko-KR"),
    ),
  );
  const available = homonymNicknameSuggestions.filter(
    (nickname) => !normalizedExcluded.has(nickname.toLocaleLowerCase("ko-KR")),
  );
  const suggestions =
    available.length > 0 ? available : homonymNicknameSuggestions;
  const index = Math.min(
    suggestions.length - 1,
    Math.floor(
      Math.max(0, Math.min(randomValue, 0.999999)) * suggestions.length,
    ),
  );
  return suggestions[index] ?? homonymNicknameSuggestions[0];
}

const legacyNicknameLabels = new Map<string, string>([
  ["power-drive", "파워 드라이브 전문가"],
  ["loop-drive-champion", "루프 드라이브 최강자"],
  ["back-drive-master", "백드라이브 마스터"],
  ["amateur-best", "아마추어 최강"],
  ["chiquita-artisan", "치키타 장인"],
  ["smash-solver", "스매시 해결사"],
  ["cut-defense-king", "커트 수비왕"],
  ["block-master", "블록의 달인"],
  ["serve-ace", "서브 에이스"],
  ["receive-artisan", "리시브 장인"],
  ["rally-dominator", "랠리 지배자"],
  ["forehand-specialist", "포핸드 스페셜리스트"],
  ["backhand-expert", "백핸드 고수"],
  ["topspin-master", "톱스핀 마스터"],
  ["backspin-strategist", "백스핀 전략가"],
  ["sidespin-wizard", "사이드스핀 마법사"],
  ["counter-drive", "카운터 드라이브"],
  ["flick-specialist", "플릭 스페셜리스트"],
  ["short-play-master", "쇼트 플레이 장인"],
  ["lob-defense", "로빙 수비수"],
  ["drop-shot-artisan", "드롭샷 장인"],
  ["third-ball-attacker", "3구 공격수"],
  ["fifth-ball-winner", "5구 승부사"],
  ["deuce-winner", "듀스 승부사"],
  ["edge-fairy", "엣지의 요정"],
  ["net-wizard", "네트의 마법사"],
  ["spin-restaurant", "회전 맛집"],
  ["rally-zombie", "랠리 좀비"],
  ["table-commander", "탁구대 지휘자"],
  ["backhand-bulldozer", "백핸드 불도저"],
]);

const nicknameCharactersPattern = /^[\p{L}\p{N} ._·-]+$/u;
const nicknameLetterPattern = /\p{L}/u;
const nicknameSensitiveTextPatterns = [
  /(?:19|20)\d{2}[./-]?(?:0[1-9]|1[0-2])[./-]?(?:0[1-9]|[12]\d|3[01])/u,
  /\d{6}-?[1-4]\d{6}/u,
  /(?:로|길|동|읍|면|리)\s*\d+(?:-\d+)?/u,
] as const;

export function containsSensitiveHomonymNickname(value: string): boolean {
  const normalized = normalizeHomonymNickname(value);
  return nicknameSensitiveTextPatterns.some((pattern) =>
    pattern.test(normalized),
  );
}

export function normalizeHomonymNickname(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ");
}

export function isHomonymNickname(value: string): boolean {
  const normalized = normalizeHomonymNickname(value);
  return (
    normalized.length >= homonymNicknameMinLength &&
    normalized.length <= homonymNicknameMaxLength &&
    nicknameCharactersPattern.test(normalized) &&
    nicknameLetterPattern.test(normalized) &&
    !containsSensitiveHomonymNickname(normalized)
  );
}

export function homonymNicknameLabel(
  nickname: string | undefined,
): string | undefined {
  if (!nickname) return undefined;
  return (
    legacyNicknameLabels.get(nickname) ?? normalizeHomonymNickname(nickname)
  );
}
