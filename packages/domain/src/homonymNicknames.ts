export const homonymNicknameCatalog = [
  { code: "power-drive", label: "파워 드라이브" },
  { code: "loop-drive-champion", label: "루프 드라이브 최강자" },
  { code: "back-drive-master", label: "백드라이브 마스터" },
  { code: "amateur-best", label: "아마추어 최강" },
  { code: "chiquita-artisan", label: "치키타 장인" },
  { code: "smash-solver", label: "스매시 해결사" },
  { code: "cut-defense-king", label: "커트 수비왕" },
  { code: "block-master", label: "블록의 달인" },
  { code: "serve-ace", label: "서브 에이스" },
  { code: "receive-artisan", label: "리시브 장인" },
  { code: "rally-dominator", label: "랠리 지배자" },
  { code: "forehand-specialist", label: "포핸드 스페셜리스트" },
  { code: "backhand-expert", label: "백핸드 고수" },
  { code: "topspin-master", label: "톱스핀 마스터" },
  { code: "backspin-strategist", label: "백스핀 전략가" },
  { code: "sidespin-wizard", label: "사이드스핀 마법사" },
  { code: "counter-drive", label: "카운터 드라이브" },
  { code: "flick-specialist", label: "플릭 스페셜리스트" },
  { code: "short-play-master", label: "쇼트 플레이 장인" },
  { code: "lob-defense", label: "로빙 수비수" },
  { code: "drop-shot-artisan", label: "드롭샷 장인" },
  { code: "third-ball-attacker", label: "3구 공격수" },
  { code: "fifth-ball-winner", label: "5구 승부사" },
  { code: "deuce-winner", label: "듀스 승부사" },
  { code: "edge-fairy", label: "엣지의 요정" },
  { code: "net-wizard", label: "네트의 마법사" },
  { code: "spin-restaurant", label: "회전 맛집" },
  { code: "rally-zombie", label: "랠리 좀비" },
  { code: "table-commander", label: "탁구대 지휘자" },
  { code: "backhand-bulldozer", label: "백핸드 불도저" },
] as const;

export type HomonymNicknameCode =
  (typeof homonymNicknameCatalog)[number]["code"];

const nicknameByCode = new Map<string, string>(
  homonymNicknameCatalog.map(({ code, label }) => [code, label]),
);

export function homonymNicknameLabel(
  code: string | undefined,
): string | undefined {
  return code ? nicknameByCode.get(code) : undefined;
}

export function isHomonymNicknameCode(
  value: string,
): value is HomonymNicknameCode {
  return nicknameByCode.has(value);
}
