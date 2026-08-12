import type {
  PlayerDetail,
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
  status: "succeeded" | "failed" | "skipped";
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
export interface IdentityClaimInput {
  candidateIds: string[];
  privateCode: string;
  note?: string;
  website?: string;
}
export interface IdentityClaimResponse {
  accepted: boolean;
  referenceId: string;
  status: "pending";
}
export interface PlayerRepository {
  listSourceStatuses(): Promise<SourceStatus[]>;
  searchPlayers(input: PlayerSearchInput): Promise<PlayerSummary[]>;
  getPlayer(id: string): Promise<PlayerDetail | null>;
  requestRefresh(input: RefreshRequest): Promise<RefreshResponse>;
  getRefreshStatus(refreshId: string): Promise<RefreshStatus>;
  submitIdentityClaim(
    input: IdentityClaimInput,
  ): Promise<IdentityClaimResponse>;
}
