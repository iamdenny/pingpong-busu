import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
const calendarVersionPattern = /^(\d{4})\.(\d{2})\.(\d+)$/u;

export interface CalendarVersion {
  year: number;
  week: number;
  sequence: number;
}

export function getIsoWeek(date: Date): Pick<CalendarVersion, "year" | "week"> {
  if (Number.isNaN(date.getTime())) {
    throw new Error("유효한 날짜가 필요합니다.");
  }

  const monday = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  const thursday = new Date(monday);
  thursday.setUTCDate(thursday.getUTCDate() + 3);
  const year = thursday.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(year, 0, 4));
  firstThursday.setUTCDate(
    firstThursday.getUTCDate() - ((firstThursday.getUTCDay() + 6) % 7),
  );
  const week =
    Math.floor((monday.getTime() - firstThursday.getTime()) / 604_800_000) + 1;
  return { year, week };
}

export function parseCalendarVersion(value: string): CalendarVersion {
  const match = calendarVersionPattern.exec(value);
  if (!match) {
    throw new Error("package.json version은 YYYY.WEEK.SEQ 형식이어야 합니다.");
  }

  const year = Number(match[1]);
  const week = Number(match[2]);
  const sequence = Number(match[3]);
  if (week < 1 || week > 53 || sequence < 1) {
    throw new Error("package.json version의 주차와 순번이 올바르지 않습니다.");
  }
  return { year, week, sequence };
}

export function nextCalendarVersion(current: string, now: Date): string {
  const previous = parseCalendarVersion(current);
  const { year, week } = getIsoWeek(now);
  const sequence =
    previous.year === year && previous.week === week
      ? previous.sequence + 1
      : 1;
  return `${year}.${String(week).padStart(2, "0")}.${sequence}`;
}

async function readPackageJson(): Promise<{
  raw: string;
  value: Record<string, unknown> & { version: string };
}> {
  const raw = await readFile("package.json", "utf8");
  const parsed = JSON.parse(raw) as unknown;
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("version" in parsed) ||
    typeof parsed.version !== "string"
  ) {
    throw new Error("package.json에 문자열 version이 필요합니다.");
  }
  return {
    raw,
    value: parsed as Record<string, unknown> & { version: string },
  };
}

async function main(): Promise<void> {
  const command = process.argv[2] ?? "check";
  const { raw, value } = await readPackageJson();
  parseCalendarVersion(value.version);

  if (command === "check") {
    process.stdout.write(`release version ${value.version}\n`);
    return;
  }
  if (command === "output") {
    process.stdout.write(`version=${value.version}\n`);
    return;
  }
  if (command === "bump") {
    const nextVersion = nextCalendarVersion(value.version, new Date());
    const updated = raw.replace(
      /"version"\s*:\s*"[^"]+"/u,
      `"version": "${nextVersion}"`,
    );
    await writeFile("package.json", updated, "utf8");
    process.stdout.write(`${nextVersion}\n`);
    return;
  }
  throw new Error(`지원하지 않는 release-version 명령입니다: ${command}`);
}

const entryPoint = process.argv[1];
if (entryPoint && pathToFileURL(entryPoint).href === import.meta.url) {
  void main().catch((error: unknown) => {
    const message =
      error instanceof Error
        ? error.message
        : "릴리즈 버전 처리에 실패했습니다.";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
