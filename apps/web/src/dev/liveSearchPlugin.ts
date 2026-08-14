import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import { z } from "zod";
import {
  isAwardRank,
  isCurrentSummaryRecord,
  normalizePlayerName,
  sortPlayerRecordsByLatest,
  type PlayerDetail,
  type PlayerSummary,
} from "@busu/domain";
import { recordsToPlayerDetails } from "@busu/crawler-core";
import { AstreeSourceAdapter } from "@busu/source-adapters";

interface CacheEntry {
  expiresAt: number;
  details: PlayerDetail[];
}
const cache = new Map<string, CacheEntry>();
const detailsById = new Map<string, PlayerDetail>();
const inFlight = new Map<string, Promise<CacheEntry>>();
const refreshSchema = z.object({
  name: z.string().trim().min(2).max(50),
  force: z.boolean().optional().default(false),
});

function sendJson(
  response: ServerResponse,
  status: number,
  body: unknown,
): void {
  response.statusCode = status;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("cache-control", "no-store");
  response.end(JSON.stringify(body));
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  let body = "";
  for await (const chunk of request) {
    body += String(chunk);
    if (body.length > 16_384) throw new Error("request_too_large");
  }
  return JSON.parse(body) as unknown;
}

function latestParticipationSummary(player: PlayerDetail): {
  latestParticipationDate?: string;
  latestParticipationTournament?: string;
  latestParticipationEvent?: string;
  latestParticipationCheckedAt?: string;
} {
  const latestParticipation = sortPlayerRecordsByLatest(
    player.records.filter(
      (record) => !isAwardRank(record.rank) && isCurrentSummaryRecord(record),
    ),
  )[0];
  if (!latestParticipation) return {};
  return {
    ...(latestParticipation.date
      ? { latestParticipationDate: latestParticipation.date }
      : {}),
    latestParticipationTournament: latestParticipation.tournament,
    latestParticipationEvent: latestParticipation.event,
    latestParticipationCheckedAt: latestParticipation.lastCheckedAt,
  };
}

function summaries(details: readonly PlayerDetail[]): PlayerSummary[] {
  return details.map((player) => ({
    id: player.id,
    name: player.name,
    normalizedName: player.normalizedName,
    ...(player.region ? { region: player.region } : {}),
    ...(player.club ? { club: player.club } : {}),
    ...(player.recentObservedDivision
      ? { recentObservedDivision: player.recentObservedDivision }
      : {}),
    ...(player.recentObservedDivisionSystem
      ? { recentObservedDivisionSystem: player.recentObservedDivisionSystem }
      : {}),
    resultCount: player.resultCount,
    ...(player.awardResults ? { awardResults: player.awardResults } : {}),
    ...latestParticipationSummary(player),
    sourceCount: player.sourceCount,
    lastCheckedAt: player.lastCheckedAt,
    ...(player.divisionObservations
      ? { divisionObservations: player.divisionObservations }
      : {}),
    identityStatus: player.identityStatus,
    dataKind: "live",
  }));
}

export function createDevLiveSearchPlugin(options: {
  enabled: boolean;
  timeoutMs: number;
  cooldownSeconds: number;
  userAgent: string;
}): Plugin {
  const adapter = new AstreeSourceAdapter(options.enabled);
  const refresh = async (name: string, force: boolean): Promise<CacheEntry> => {
    const queryKey = normalizePlayerName(name);
    const existing = cache.get(queryKey);
    if (!force && existing && existing.expiresAt > Date.now()) return existing;
    const pending = inFlight.get(queryKey);
    if (pending) return pending;
    const task = adapter
      .search(
        { name, normalizedName: queryKey, maxPages: 2, live: true },
        {
          now: () => new Date(),
          timeoutMs: options.timeoutMs,
          userAgent: options.userAgent,
        },
      )
      .then((result) => {
        const details = recordsToPlayerDetails(
          result.records,
          "astree",
          "애즈트리",
        );
        const entry = {
          expiresAt: Date.now() + options.cooldownSeconds * 1000,
          details,
        };
        cache.set(queryKey, entry);
        for (const detail of details) detailsById.set(detail.id, detail);
        return entry;
      })
      .finally(() => inFlight.delete(queryKey));
    inFlight.set(queryKey, task);
    return task;
  };

  return {
    name: "busu-dev-live-search",
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const url = new URL(request.url ?? "/", "http://localhost");
        if (!url.pathname.startsWith("/api/dev/")) {
          next();
          return;
        }
        if (!options.enabled) {
          sendJson(response, 503, { error: "live_search_disabled" });
          return;
        }
        try {
          if (request.method === "GET" && url.pathname === "/api/dev/players") {
            const queryKey = normalizePlayerName(
              url.searchParams.get("query") ?? "",
            );
            sendJson(
              response,
              200,
              summaries(cache.get(queryKey)?.details ?? []),
            );
            return;
          }
          if (
            request.method === "GET" &&
            url.pathname.startsWith("/api/dev/players/")
          ) {
            const id = decodeURIComponent(
              url.pathname.slice("/api/dev/players/".length),
            );
            const detail = detailsById.get(id);
            sendJson(
              response,
              detail ? 200 : 404,
              detail ?? { error: "player_not_found" },
            );
            return;
          }
          if (
            request.method === "POST" &&
            url.pathname === "/api/dev/refresh"
          ) {
            const input = refreshSchema.parse(await readJson(request));
            const entry = await refresh(input.name, input.force);
            sendJson(response, 200, {
              refreshId: `astree-${normalizePlayerName(input.name)}`,
              accepted: true,
              state: "completed",
              recordsFound: entry.details.reduce(
                (count, player) => count + player.records.length,
                0,
              ),
              candidatesFound: entry.details.length,
            });
            return;
          }
          sendJson(response, 404, { error: "not_found" });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "unknown_error";
          sendJson(response, 502, { error: "source_refresh_failed", message });
        }
      });
    },
  };
}
