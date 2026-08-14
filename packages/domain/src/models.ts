import { z } from "zod";

export const sourceCodes = [
  "mock",
  "airping",
  "astree",
  "newttplay",
  "ttadivision",
  "okpingpong",
  "mytt",
  "superstar",
  "yongintt",
  "iping",
  "band",
] as const;
export const sourceCodeSchema = z.enum(sourceCodes);
export type SourceCode = z.infer<typeof sourceCodeSchema>;
export type EventType = "singles" | "doubles" | "team" | "unknown";
export const divisionSystemCodes = [
  "open",
  "integrated",
  "women",
  "regional",
  "division",
  "unknown",
] as const;
export const divisionSystemSchema = z.enum(divisionSystemCodes);
export type DivisionSystem = z.infer<typeof divisionSystemSchema>;

export interface AwardResultSummary {
  rank: string;
  date?: string;
  tournament?: string;
  lastCheckedAt?: string;
}

export interface DivisionObservationSummary {
  system: DivisionSystem;
  division: string;
  awardCount: number;
  participationCount: number;
}

export interface SourceStatus {
  sourceCode: SourceCode;
  displayName: string;
  baseUrl: string;
  adapterMode: "http" | "browser" | "manual";
  enabled: boolean;
  parserVersion: string;
}

export const normalizedRecordSchema = z.object({
  sourceCode: sourceCodeSchema,
  externalPlayerId: z.string().min(1).optional(),
  sourceIdentityKey: z.string().min(1).optional(),
  playerName: z.string().min(1),
  normalizedPlayerName: z.string().min(1),
  clubText: z.string().min(1).optional(),
  region: z.string().min(1).optional(),
  tournamentRegion: z.string().min(1).optional(),
  tournamentName: z.string().min(1),
  tournamentDate: z.string().date().optional(),
  sourcePublishedDate: z.string().date().optional(),
  eventName: z.string().min(1),
  eventType: z.enum(["singles", "doubles", "team", "unknown"]),
  divisionSystem: divisionSystemSchema.optional(),
  divisionValue: z.string().optional(),
  rankText: z.string().optional(),
  partnerText: z.string().optional(),
  sourceUrl: z.string().url(),
  observedAt: z.string().datetime(),
  naturalKeyHash: z.string(),
  contentHash: z.string(),
});

export type NormalizedRecord = z.infer<typeof normalizedRecordSchema>;

export interface PlayerSummary {
  id: string;
  name: string;
  normalizedName: string;
  region?: string;
  club?: string;
  recentObservedDivision?: string;
  recentObservedDivisionSystem?: DivisionSystem;
  resultCount: number;
  awardResults?: AwardResultSummary[];
  latestParticipationDate?: string;
  latestParticipationTournament?: string;
  latestParticipationCheckedAt?: string;
  divisionObservations?: DivisionObservationSummary[];
  sourceCount: number;
  lastCheckedAt: string;
  identityStatus: "unreviewed" | "likely" | "verified" | "disputed";
  homonymNickname?: string;
  dataKind?: "demo" | "live";
}

export interface PlayerRecord {
  id: string;
  date?: string;
  dateBasis?: "tournament" | "published";
  tournamentRegion?: string;
  tournament: string;
  scale: "national" | "province" | "district" | "club" | "unknown";
  event: string;
  club?: string;
  division?: string;
  divisionSystem?: DivisionSystem;
  rank?: string;
  sourceCode: SourceCode;
  sourceName: string;
  sourceUrl: string;
  lastCheckedAt: string;
}

export interface SourceComparison {
  sourceCode: SourceCode;
  sourceName: string;
  latestRecordDate?: string;
  latestClub?: string;
  recentObservedDivision?: string;
  recentObservedDivisionSystem?: DivisionSystem;
  resultCount: number;
  latestRank?: string;
  lastCheckedAt?: string;
  status:
    "fresh" | "refreshing" | "unsupported" | "delayed" | "parser_attention";
}

export interface PlayerDetail extends PlayerSummary {
  records: PlayerRecord[];
  sources: SourceComparison[];
}
