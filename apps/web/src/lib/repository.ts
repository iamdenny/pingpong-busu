import type {
  PlayerDetail,
  PlayerRecord,
  PlayerSummary,
  SourceCode,
  SourceStatus,
} from "@busu/domain";

export interface PlayerSearchInput {
  query: string;
  region?: string;
  club?: string;
  sourceCode?: SourceCode;
}
export interface RefreshRequest {
  name: string;
  club?: string;
  region?: string;
  sourceCodes?: SourceCode[];
  force?: boolean;
}
export interface RefreshSourceResult {
  sourceCode: SourceCode;
  status: "succeeded" | "failed" | "skipped" | "queued";
  inserted?: number | undefined;
  updated?: number | undefined;
  unchanged?: number | undefined;
  found?: number | undefined;
  reason?: string | undefined;
  errorCode?: string | undefined;
  message?: string | undefined;
  retryAfterMs?: number | undefined;
}
export interface RefreshResponse {
  refreshId: string;
  accepted: boolean;
  recordsFound?: number;
  candidatesFound?: number;
  sources: RefreshSourceResult[];
}
export interface RefreshStatus {
  refreshId: string;
  state: "running" | "completed" | "partial";
}
export interface IdentityEditGroupInput {
  nickname: string;
  candidateIds: string[];
}
export interface IdentityEditInput {
  groups: IdentityEditGroupInput[];
  editorId: string;
  note?: string;
  website?: string;
}
export interface IdentityEditResponse {
  accepted: boolean;
  referenceId: string;
  operationId: string;
  status: "applied";
  groupCount: number;
}
export interface IdentityEditCandidate {
  playerId: string;
  name: string;
  region?: string;
  club?: string;
  groupNickname?: string;
}
export interface IdentityEditHistoryEntry {
  operationId: string;
  referenceId: string;
  normalizedName: string;
  status: "applied" | "reverted";
  targetPlayerId: string;
  targetPlayerName: string;
  reason: string;
  createdAt: string;
  revertedAt?: string;
  revertReason?: string;
  canRevert: boolean;
  candidates: IdentityEditCandidate[];
}
export interface RevertIdentityEditInput {
  operationId: string;
  editorId: string;
  reason: string;
  website?: string;
}
export interface RevertIdentityEditResponse {
  reverted: boolean;
  operationId: string;
  status: "reverted";
}
export interface IdentityCandidateEvidence {
  candidateId: string;
  records: PlayerRecord[];
  status: "loaded" | "error";
}
export interface PlayerRepository {
  listSourceStatuses(): Promise<SourceStatus[]>;
  searchPlayers(input: PlayerSearchInput): Promise<PlayerSummary[]>;
  getPlayer(id: string): Promise<PlayerDetail | null>;
  getIdentityCandidateEvidence(
    candidateIds: readonly string[],
  ): Promise<IdentityCandidateEvidence[]>;
  requestRefresh(input: RefreshRequest): Promise<RefreshResponse>;
  getRefreshStatus(refreshId: string): Promise<RefreshStatus>;
  applyIdentityEdit(input: IdentityEditInput): Promise<IdentityEditResponse>;
  listIdentityEditHistory(
    normalizedName: string,
  ): Promise<IdentityEditHistoryEntry[]>;
  revertIdentityEdit(
    input: RevertIdentityEditInput,
  ): Promise<RevertIdentityEditResponse>;
}
