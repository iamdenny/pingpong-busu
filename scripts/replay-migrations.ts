// Applies every migration to a throwaway PostgreSQL container so schema changes
// fail here instead of in the production deployment. Supabase-only extensions
// are stubbed: the goal is to validate this repository's SQL, not to reproduce
// the managed platform.
import { execFile } from "node:child_process";
import { readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

const CONTAINER = "busu-migration-replay";
const IMAGE = "postgres:17";
const DATABASE = "busu";
const MIGRATIONS = resolve(import.meta.dirname, "../supabase/migrations");
const SEED = resolve(import.meta.dirname, "../supabase/seed.sql");

// The anon role's predicates are reproduced here so a replay behaves like the
// deployed database for the public views under test.
const BOOTSTRAP = `
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
end $$;
create schema if not exists auth;
create schema if not exists extensions;
create schema if not exists cron;
create extension if not exists pgcrypto;
create extension if not exists "uuid-ossp";
create or replace function cron.schedule(text, text, text) returns bigint language sql as $$ select 0::bigint $$;
create or replace function cron.unschedule(text) returns boolean language sql as $$ select true $$;
`;

const GRANTS = `
grant usage on schema public to anon, authenticated, service_role;
grant select on all tables in schema public to anon, authenticated;
`;

async function docker(
  args: readonly string[],
): Promise<{ stdout: string; stderr: string }> {
  return run("docker", [...args], { maxBuffer: 64 * 1024 * 1024 });
}

async function psql(sql: string): Promise<string> {
  const { stdout } = await docker([
    "exec",
    "-i",
    CONTAINER,
    "psql",
    "-U",
    "postgres",
    "-d",
    DATABASE,
    "-v",
    "ON_ERROR_STOP=1",
    "-q",
    "-c",
    sql,
  ]);
  return stdout;
}

async function psqlValue(sql: string): Promise<string> {
  const { stdout } = await docker([
    "exec",
    "-i",
    CONTAINER,
    "psql",
    "-U",
    "postgres",
    "-d",
    DATABASE,
    "-t",
    "-A",
    "-c",
    sql,
  ]);
  return stdout.trim();
}

async function waitForPostgres(): Promise<void> {
  const deadline = Date.now() + 60_000;
  for (;;) {
    try {
      await docker(["exec", CONTAINER, "pg_isready", "-U", "postgres"]);
      return;
    } catch {
      if (Date.now() > deadline)
        throw new Error("PostgreSQL did not become ready within 60s.");
      await new Promise((wake) => setTimeout(wake, 500));
    }
  }
}

async function requireDocker(): Promise<void> {
  try {
    await docker(["info"]);
  } catch {
    throw new Error(
      "Docker is required for a migration replay. Start Docker and retry.",
    );
  }
}

async function applyMigrations(): Promise<number> {
  const files = (await readdir(MIGRATIONS))
    .filter((name) => name.endsWith(".sql"))
    .sort();
  if (files.length === 0) throw new Error("No migrations were found.");
  for (const file of files) {
    // pg_cron only exists on the managed platform; the scheduling statements
    // are replaced so the rest of each migration still runs.
    try {
      await docker([
        "exec",
        "-i",
        CONTAINER,
        "bash",
        "-c",
        `sed -E 's/create extension if not exists +pg_cron[^;]*;/select 1;/Ig; s/create extension +pg_cron[^;]*;/select 1;/Ig' /migrations/${file} | psql -U postgres -d ${DATABASE} -v ON_ERROR_STOP=1 -q`,
      ]);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`Migration ${file} failed.\n${detail}`);
    }
  }
  return files.length;
}

async function cleanup(): Promise<void> {
  await docker(["rm", "-f", CONTAINER]).catch(() => undefined);
}

async function main(): Promise<void> {
  const withSeed = process.argv.includes("--seed");
  await requireDocker();
  await cleanup();
  await docker([
    "run",
    "-d",
    "--name",
    CONTAINER,
    "-e",
    "POSTGRES_PASSWORD=replay",
    "-e",
    `POSTGRES_DB=${DATABASE}`,
    IMAGE,
  ]);
  try {
    await waitForPostgres();
    await docker(["cp", MIGRATIONS, `${CONTAINER}:/migrations`]);
    await psql(BOOTSTRAP);
    const applied = await applyMigrations();
    // The managed platform grants anon/authenticated SELECT on everything in
    // `public` through default privileges; RLS is what actually restricts them.
    // Migrations therefore only grant on views, so a faithful replay adds the
    // platform grants here rather than leaving anon unable to read anything.
    await psql(GRANTS);
    if (withSeed) {
      await docker(["cp", SEED, `${CONTAINER}:/seed.sql`]);
      await docker([
        "exec",
        "-i",
        CONTAINER,
        "psql",
        "-U",
        "postgres",
        "-d",
        DATABASE,
        "-v",
        "ON_ERROR_STOP=1",
        "-q",
        "-f",
        "/seed.sql",
      ]);
    }
    const views = await psqlValue(
      "select count(*) from information_schema.views where table_schema = 'public';",
    );
    console.log(`Applied ${applied} migrations.`);
    console.log(`Public views: ${views}`);
    if (withSeed) console.log("Seed applied.");
    console.log("Migration replay passed.");
  } finally {
    await cleanup();
  }
}

await main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
