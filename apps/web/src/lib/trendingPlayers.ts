import type { TrendingPlayer } from "@busu/domain";

export const TRENDING_PLAYER_LIMIT = 10;
export const TRENDING_PLAYER_MOBILE_VISIBLE = 5;
export const TRENDING_REFRESH_INTERVAL_MS = 10 * 60 * 1000;

const updatedAtFormatter = new Intl.DateTimeFormat("ko-KR", {
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export function formatTrendingUpdatedAt(value: string): string {
  const updatedAt = new Date(value);
  if (Number.isNaN(updatedAt.getTime())) return "";
  return `${updatedAtFormatter.format(updatedAt)} 기준`;
}

export function trendingPlayerContext(player: TrendingPlayer): string {
  // The ranking never carries a division so it cannot be read as a skill order.
  return [player.club, player.region].filter(Boolean).join(" · ");
}
