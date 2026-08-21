import { useQuery } from "@tanstack/react-query";
import { homonymNicknameLabel } from "@busu/domain";
import { useState, useSyncExternalStore, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { trackAnalyticsEvent } from "../lib/analytics";
import { playerRepository } from "../lib/runtime";
import {
  TRENDING_PLAYER_MOBILE_VISIBLE,
  TRENDING_REFRESH_INTERVAL_MS,
  formatTrendingUpdatedAt,
  trendingPlayerContext,
} from "../lib/trendingPlayers";
import { CollapsibleContent } from "./CollapsibleContent";

const NARROW_VIEWPORT = "(max-width: 700px)";

function useNarrowViewport(): boolean {
  return useSyncExternalStore(
    (onStoreChange) => {
      if (typeof window.matchMedia !== "function") return () => undefined;
      const query = window.matchMedia(NARROW_VIEWPORT);
      query.addEventListener("change", onStoreChange);
      return () => query.removeEventListener("change", onStoreChange);
    },
    () =>
      typeof window.matchMedia === "function" &&
      window.matchMedia(NARROW_VIEWPORT).matches,
    () => false,
  );
}

export function TrendingPlayers() {
  const narrow = useNarrowViewport();
  const [expanded, setExpanded] = useState(false);
  const trending = useQuery({
    queryKey: ["trending-players"],
    queryFn: () => playerRepository.listTrendingPlayers(),
    staleTime: TRENDING_REFRESH_INTERVAL_MS,
    refetchInterval: TRENDING_REFRESH_INTERVAL_MS,
  });

  const players = trending.data?.players ?? [];
  // A ranking nobody has filled yet is hidden instead of shown empty.
  if (players.length === 0) return null;

  const updatedAt = formatTrendingUpdatedAt(trending.data?.updatedAt ?? "");
  const folded = narrow && players.length > TRENDING_PLAYER_MOBILE_VISIBLE;
  const visible = folded
    ? players.slice(0, TRENDING_PLAYER_MOBILE_VISIBLE)
    : players;
  const hidden = folded ? players.slice(TRENDING_PLAYER_MOBILE_VISIBLE) : [];

  const entry = (player: (typeof players)[number], index: number) => (
    <li key={player.playerId}>
      <Link
        to={`/players/${player.playerId}`}
        onClick={() =>
          trackAnalyticsEvent("trending_player_clicked", {
            player_id: player.playerId,
            position: index + 1,
          })
        }
      >
        <span className="trending-players__rank" aria-hidden="true">
          {index + 1}
        </span>
        <span className="trending-players__name">
          <span className="visually-hidden">{index + 1}위 </span>
          {player.name}
          {player.homonymNickname && (
            <span className="homonym-nickname-badge">
              {homonymNicknameLabel(player.homonymNickname)}
            </span>
          )}
        </span>
        <span className="trending-players__context">
          {trendingPlayerContext(player)}
        </span>
      </Link>
    </li>
  );

  return (
    <section
      className="trending-players"
      aria-labelledby="trending-players-title"
    >
      <div className="trending-players__header">
        <h2 id="trending-players-title">최근 24시간 많이 찾은 선수</h2>
        {updatedAt && <span>10분마다 갱신 · {updatedAt}</span>}
      </div>
      <ol
        className="trending-players__list"
        style={{ "--trending-rows": Math.ceil(visible.length / 2) } as CSSProperties}
      >
        {visible.map((player, index) => entry(player, index))}
      </ol>
      {folded && (
        <>
          <CollapsibleContent id="trending-players-rest" expanded={expanded}>
            <ol
              className="trending-players__list"
              start={TRENDING_PLAYER_MOBILE_VISIBLE + 1}
            >
              {hidden.map((player, index) =>
                entry(player, index + TRENDING_PLAYER_MOBILE_VISIBLE),
              )}
            </ol>
          </CollapsibleContent>
          <button
            type="button"
            className="trending-players__more"
            aria-controls="trending-players-rest"
            aria-expanded={expanded}
            onClick={() => setExpanded((current) => !current)}
          >
            {expanded
              ? "접기"
              : `${TRENDING_PLAYER_MOBILE_VISIBLE + 1}~${players.length}위 더 보기`}
          </button>
        </>
      )}
      <p className="trending-players__note">
        공개 선수 페이지의 조회 순위입니다. 실력·부수 순위가 아니며 검색어는
        집계하지 않습니다.
      </p>
    </section>
  );
}
