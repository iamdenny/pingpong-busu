import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  inferDivisionSystem,
  normalizePlayerName,
  normalizedRecordSchema,
  type NormalizedRecord,
} from "@busu/domain";
import { InMemoryRecordRepository } from "@busu/crawler-core";
import {
  MockSourceAdapter,
  airpingAdapter,
  astreeAdapter,
  ipingAdapter,
  okpingpongAdapter,
  myttAdapter,
  superstarAdapter,
  ttaDivisionAdapter,
  yonginTtAdapter,
} from "@busu/source-adapters";
import rootPackage from "../package.json";

const args = process.argv.slice(2);
const mode = args[0] ?? "fixture";
const value = (flag: string) => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
};
const query = value("--query") ?? "김탁구";
const reportedQuery =
  process.env.CRAWLER_REDACT_QUERY === "true" ? "[redacted]" : query;
const version = Number(value("--version") ?? "1") === 2 ? 2 : 1;
const source = value("--source") ?? "mock";
const statePath = resolve(".busu-crawler-state.json");
type State = { records: NormalizedRecord[]; revisions: number };
const migrateStoredRecord = (value: unknown): unknown => {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return value;
  const record = { ...value } as Record<string, unknown>;
  if (
    typeof record.divisionSystem === "string" &&
    ![
      "open",
      "integrated",
      "women",
      "regional",
      "division",
      "unknown",
    ].includes(record.divisionSystem)
  ) {
    record.divisionSystem = inferDivisionSystem(
      record.divisionSystem,
      typeof record.tournamentName === "string"
        ? record.tournamentName
        : undefined,
      typeof record.eventName === "string" ? record.eventName : undefined,
      typeof record.divisionValue === "string"
        ? record.divisionValue
        : undefined,
    );
  }
  return record;
};
const parseStoredState = (
  value: unknown,
): { records: unknown[]; revisions: number } => {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error("crawler state must be an object");
  const candidate = value as Record<string, unknown>;
  if (
    !Array.isArray(candidate.records) ||
    typeof candidate.revisions !== "number" ||
    !Number.isInteger(candidate.revisions) ||
    candidate.revisions < 0
  )
    throw new Error("crawler state schema is invalid");
  return { records: candidate.records, revisions: candidate.revisions };
};
const stored = existsSync(statePath)
  ? parseStoredState(JSON.parse(readFileSync(statePath, "utf8")))
  : { records: [], revisions: 0 };
const state: State = {
  records: stored.records.map((record) =>
    normalizedRecordSchema.parse(migrateStoredRecord(record)),
  ),
  revisions: stored.revisions,
};
const repository = new InMemoryRecordRepository();
for (const record of state.records)
  repository.records.set(
    record.naturalKeyHash,
    normalizedRecordSchema.parse(record),
  );
const started = performance.now();
if (mode === "live" && process.env.CRAWL_LIVE !== "true") {
  console.error(
    "live crawling is disabled: set CRAWL_LIVE=true after policy approval",
  );
  process.exitCode = 2;
} else {
  const adapters = {
    mock: new MockSourceAdapter(version),
    airping: airpingAdapter,
    astree: astreeAdapter,
    ttadivision: ttaDivisionAdapter,
    okpingpong: okpingpongAdapter,
    mytt: myttAdapter,
    superstar: superstarAdapter,
    yongintt: yonginTtAdapter,
    iping: ipingAdapter,
  };
  const adapter = adapters[source as keyof typeof adapters];
  if (!adapter) {
    console.error(`unsupported source: ${source}`);
    process.exitCode = 2;
  } else
    try {
      const result = await adapter.search(
        {
          name: query,
          normalizedName: normalizePlayerName(query),
          maxPages: Number(value("--maxPages") ?? 1),
          live: mode === "live",
        },
        {
          now: () => new Date(),
          timeoutMs: Number(process.env.CRAWLER_REQUEST_TIMEOUT_MS ?? 8000),
          userAgent:
            process.env.CRAWLER_USER_AGENT || `BUSU/${rootPackage.version}`,
        },
      );
      const summary = repository.upsertMany(result.records);
      state.records = [...repository.records.values()];
      state.revisions += repository.revisions.length;
      writeFileSync(statePath, JSON.stringify(state, null, 2));
      console.log(
        JSON.stringify(
          {
            source: adapter.sourceCode,
            query: reportedQuery,
            found: result.records.length,
            ...summary,
            failed: 0,
            revisions: repository.revisions.length,
            durationMs: Math.round(performance.now() - started),
          },
          null,
          2,
        ),
      );
    } catch (error) {
      console.error(
        JSON.stringify(
          {
            source,
            query: reportedQuery,
            found: 0,
            inserted: 0,
            updated: 0,
            unchanged: 0,
            failed: 1,
            error: error instanceof Error ? error.message : "unknown",
            durationMs: Math.round(performance.now() - started),
          },
          null,
          2,
        ),
      );
      process.exitCode = 1;
    }
}
