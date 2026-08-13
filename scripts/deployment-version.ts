import { pathToFileURL } from "node:url";

const millisecondsPerWeek = 7 * 24 * 60 * 60 * 1000;
const deploymentVersionPattern = /^\d{4}\.\d{2}\.\d+$/u;

export interface IsoWeek {
  year: number;
  week: number;
  startsAt: Date;
}

export interface WorkflowRun {
  id: number;
  runAttempt: number;
  startedAt: string;
}

interface GitHubWorkflowRunsResponse {
  workflow_runs: unknown[];
}

interface DeploymentVersionEnvironment {
  repository: string;
  token: string;
  currentRunId: number;
  currentRunAttempt: number;
}

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} 환경 변수가 필요합니다.`);
  return value;
}

function positiveInteger(value: string, name: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error(`${name}은 1 이상의 정수여야 합니다.`);
  }
  return parsed;
}

function readEnvironment(): DeploymentVersionEnvironment {
  const repository = requiredEnvironment("GITHUB_REPOSITORY");
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(repository)) {
    throw new Error("GITHUB_REPOSITORY 형식이 올바르지 않습니다.");
  }

  return {
    repository,
    token: requiredEnvironment("GITHUB_TOKEN"),
    currentRunId: positiveInteger(
      requiredEnvironment("GITHUB_RUN_ID"),
      "GITHUB_RUN_ID",
    ),
    currentRunAttempt: positiveInteger(
      requiredEnvironment("GITHUB_RUN_ATTEMPT"),
      "GITHUB_RUN_ATTEMPT",
    ),
  };
}

export function getIsoWeek(date: Date): IsoWeek {
  if (Number.isNaN(date.getTime()))
    throw new Error("유효한 배포 시각이 필요합니다.");

  const startsAt = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  const daysSinceMonday = (startsAt.getUTCDay() + 6) % 7;
  startsAt.setUTCDate(startsAt.getUTCDate() - daysSinceMonday);

  const thursday = new Date(startsAt);
  thursday.setUTCDate(thursday.getUTCDate() + 3);
  const year = thursday.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(year, 0, 4));
  const firstWeekStart = new Date(firstThursday);
  firstWeekStart.setUTCDate(
    firstWeekStart.getUTCDate() - ((firstWeekStart.getUTCDay() + 6) % 7),
  );
  const week =
    Math.floor(
      (startsAt.getTime() - firstWeekStart.getTime()) / millisecondsPerWeek,
    ) + 1;

  return { year, week, startsAt };
}

export function formatDeploymentVersion(date: Date, sequence: number): string {
  if (!Number.isSafeInteger(sequence) || sequence < 1) {
    throw new Error("배포 순번은 1 이상의 정수여야 합니다.");
  }
  const { year, week } = getIsoWeek(date);
  const version = `${year}.${String(week).padStart(2, "0")}.${sequence}`;
  if (!deploymentVersionPattern.test(version)) {
    throw new Error("생성된 배포 버전 형식이 올바르지 않습니다.");
  }
  return version;
}

export function calculateWeeklySequence(
  runs: readonly WorkflowRun[],
  currentRun: Pick<WorkflowRun, "id" | "runAttempt">,
  deployedAt: Date,
): number {
  const { startsAt } = getIsoWeek(deployedAt);
  const weekEnd = startsAt.getTime() + millisecondsPerWeek;
  const attemptsByRun = new Map<number, number>();

  for (const run of runs) {
    const startedAt = new Date(run.startedAt).getTime();
    if (
      Number.isNaN(startedAt) ||
      startedAt < startsAt.getTime() ||
      startedAt >= weekEnd ||
      run.runAttempt < 1
    ) {
      continue;
    }
    attemptsByRun.set(
      run.id,
      Math.max(attemptsByRun.get(run.id) ?? 0, run.runAttempt),
    );
  }

  attemptsByRun.set(
    currentRun.id,
    Math.max(attemptsByRun.get(currentRun.id) ?? 0, currentRun.runAttempt),
  );
  return [...attemptsByRun.values()].reduce(
    (total, attempt) => total + attempt,
    0,
  );
}

function parseWorkflowRun(value: unknown): WorkflowRun {
  if (typeof value !== "object" || value === null) {
    throw new Error("GitHub Actions 실행 정보가 객체가 아닙니다.");
  }
  const run = value as Record<string, unknown>;
  const startedAt = run.run_started_at ?? run.created_at;
  if (
    typeof run.id !== "number" ||
    !Number.isSafeInteger(run.id) ||
    typeof run.run_attempt !== "number" ||
    !Number.isSafeInteger(run.run_attempt) ||
    typeof startedAt !== "string"
  ) {
    throw new Error("GitHub Actions 실행 정보 형식이 올바르지 않습니다.");
  }
  return { id: run.id, runAttempt: run.run_attempt, startedAt };
}

function parseWorkflowRunsResponse(value: unknown): GitHubWorkflowRunsResponse {
  if (typeof value !== "object" || value === null) {
    throw new Error("GitHub Actions 응답이 객체가 아닙니다.");
  }
  const workflowRuns = (value as Record<string, unknown>).workflow_runs;
  if (!Array.isArray(workflowRuns)) {
    throw new Error("GitHub Actions 응답에 workflow_runs가 없습니다.");
  }
  return { workflow_runs: workflowRuns };
}

async function loadWeeklyWorkflowRuns(
  environment: DeploymentVersionEnvironment,
  deployedAt: Date,
): Promise<WorkflowRun[]> {
  const { startsAt } = getIsoWeek(deployedAt);
  const runs: WorkflowRun[] = [];

  for (let page = 1; page <= 10; page += 1) {
    const url = new URL(
      `https://api.github.com/repos/${environment.repository}/actions/workflows/deploy-pages.yml/runs`,
    );
    url.searchParams.set("created", `>=${startsAt.toISOString()}`);
    url.searchParams.set("per_page", "100");
    url.searchParams.set("page", String(page));
    const response = await fetch(url, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${environment.token}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
    if (!response.ok) {
      throw new Error(
        `GitHub Actions 실행 이력 조회 실패 (${response.status})`,
      );
    }

    const body = parseWorkflowRunsResponse(await response.json());
    runs.push(...body.workflow_runs.map(parseWorkflowRun));
    if (body.workflow_runs.length < 100) return runs;
  }

  throw new Error(
    "한 주의 배포 실행이 1,000회를 초과해 순번을 계산할 수 없습니다.",
  );
}

async function main(): Promise<void> {
  const environment = readEnvironment();
  const deployedAt = new Date();
  const runs = await loadWeeklyWorkflowRuns(environment, deployedAt);
  const sequence = calculateWeeklySequence(
    runs,
    { id: environment.currentRunId, runAttempt: environment.currentRunAttempt },
    deployedAt,
  );
  process.stdout.write(
    `version=${formatDeploymentVersion(deployedAt, sequence)}\n`,
  );
}

const entryPoint = process.argv[1];
if (entryPoint && pathToFileURL(entryPoint).href === import.meta.url) {
  void main().catch((error: unknown) => {
    const message =
      error instanceof Error ? error.message : "배포 버전 생성에 실패했습니다.";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
