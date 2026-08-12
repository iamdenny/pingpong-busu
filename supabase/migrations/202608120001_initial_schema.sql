create extension if not exists pgcrypto;

create type public.adapter_mode as enum ('http','browser','manual');
create type public.identity_status as enum ('unreviewed','likely','verified','disputed');
create type public.match_status as enum ('unlinked','candidate','linked','disputed');
create type public.tournament_scale as enum ('national','province','district','club','unknown');
create type public.event_type as enum ('singles','doubles','team','unknown');
create type public.record_status as enum ('active','missing','corrected','disputed');
create type public.refresh_status as enum ('pending','running','succeeded','partial','failed','skipped');
create type public.job_type as enum ('http','browser');

create table public.sources (
  id bigint generated always as identity primary key, code text not null unique check (code in ('mock','airping','astree','okpingpong','mytt','band')),
  display_name text not null, base_url text not null check (base_url ~ '^https?://'), adapter_mode public.adapter_mode not null,
  enabled boolean not null default false, parser_version text not null, last_attempt_at timestamptz, last_success_at timestamptz,
  last_error_code text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.clubs (id bigint generated always as identity primary key, canonical_name text not null, normalized_name text not null, region text, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create index clubs_normalized_name_idx on public.clubs(normalized_name);
create table public.club_aliases (id bigint generated always as identity primary key, club_id bigint not null references public.clubs on delete cascade, alias text not null, normalized_alias text not null, source_id bigint references public.sources, created_at timestamptz not null default now());
create index club_aliases_normalized_alias_idx on public.club_aliases(normalized_alias);
create table public.players (id bigint generated always as identity primary key, public_id uuid not null unique default gen_random_uuid(), canonical_name text not null, normalized_name text not null, primary_club_id bigint references public.clubs, primary_region text, identity_status public.identity_status not null default 'unreviewed', created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create index players_normalized_name_idx on public.players(normalized_name);
create table public.source_player_identities (id bigint generated always as identity primary key, player_id bigint references public.players, source_id bigint not null references public.sources, external_player_id text, source_name text not null, normalized_source_name text not null, source_club_text text, source_region text, source_url text not null check (source_url ~ '^https?://'), first_seen_at timestamptz not null, last_seen_at timestamptz not null, last_checked_at timestamptz not null, content_hash text not null, match_status public.match_status not null default 'unlinked', created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create unique index source_identity_external_id_uidx on public.source_player_identities(source_id, external_player_id) where external_player_id is not null;
create index source_identity_name_idx on public.source_player_identities(normalized_source_name);
create table public.tournaments (id bigint generated always as identity primary key, canonical_name text not null, normalized_name text not null, held_on date, region text, scale public.tournament_scale default 'unknown', organizer text, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.results (id bigint generated always as identity primary key, source_id bigint not null references public.sources, source_player_identity_id bigint not null references public.source_player_identities, tournament_id bigint references public.tournaments, tournament_name_text text not null, event_name text not null, event_type public.event_type default 'unknown', division_system text, division_value text, rank_text text, club_text text, partner_text text, source_url text not null check (source_url ~ '^https?://'), natural_key_hash text not null unique, content_hash text not null, first_seen_at timestamptz not null, last_seen_at timestamptz not null, last_checked_at timestamptz not null, record_status public.record_status not null default 'active', created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create index results_identity_checked_idx on public.results(source_player_identity_id,last_checked_at desc);
create index results_tournament_idx on public.results(tournament_id);
create index results_natural_hash_idx on public.results(natural_key_hash);
create index results_content_hash_idx on public.results(content_hash);
create table public.source_refreshes (id bigint generated always as identity primary key, source_id bigint not null references public.sources, query_key text not null, query_display text not null, status public.refresh_status not null default 'pending', requested_at timestamptz not null default now(), started_at timestamptz, completed_at timestamptz, records_found integer not null default 0, records_inserted integer not null default 0, records_updated integer not null default 0, records_unchanged integer not null default 0, error_code text, error_message text, parser_version text not null, expires_at timestamptz);
create index source_refresh_lookup_idx on public.source_refreshes(source_id,query_key,requested_at desc);
create table public.result_revisions (id bigint generated always as identity primary key, result_id bigint not null references public.results on delete cascade, previous_data jsonb not null, next_data jsonb not null, changed_fields text[] not null, detected_at timestamptz not null default now(), source_refresh_id bigint references public.source_refreshes);
create table public.refresh_jobs (id bigint generated always as identity primary key, source_id bigint not null references public.sources, query_key text not null, query_payload jsonb not null, job_type public.job_type not null, status public.refresh_status not null default 'pending', refresh_bucket bigint not null, requested_at timestamptz not null default now(), started_at timestamptz, completed_at timestamptz, attempt_count integer not null default 0, next_attempt_at timestamptz, last_error_code text, unique(source_id,query_key,refresh_bucket));
create index refresh_jobs_next_idx on public.refresh_jobs(status,next_attempt_at);
create table public.correction_requests (id bigint generated always as identity primary key, player_id bigint references public.players, result_id bigint references public.results, request_type text not null, message text not null check (char_length(message) between 10 and 2000), evidence_url text check (evidence_url is null or evidence_url ~ '^https?://'), status text not null default 'pending', created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.rule_sets (id bigint generated always as identity primary key, tournament_id bigint references public.tournaments, name text not null, version text not null, effective_from date not null, effective_to date, rule_json jsonb not null, source_url text check (source_url is null or source_url ~ '^https?://'), created_at timestamptz not null default now());

create view public.public_player_search with (security_invoker = true) as
select p.public_id::text id, p.canonical_name, p.normalized_name, p.primary_region, c.canonical_name primary_club,
  (array_agg(r.division_value order by r.last_seen_at desc) filter (where r.division_value is not null))[1] recent_observed_division,
  count(distinct r.id)::integer result_count, count(distinct r.source_id)::integer source_count, coalesce(max(r.last_checked_at),p.updated_at) last_checked_at, p.identity_status
from public.players p left join public.clubs c on c.id=p.primary_club_id left join public.source_player_identities spi on spi.player_id=p.id left join public.results r on r.source_player_identity_id=spi.id and r.record_status <> 'disputed'
group by p.id,c.canonical_name;
create view public.public_results with (security_invoker = true) as select r.*, s.code source_code, s.display_name source_name, p.public_id player_public_id from public.results r join public.sources s on s.id=r.source_id join public.source_player_identities spi on spi.id=r.source_player_identity_id join public.players p on p.id=spi.player_id where r.record_status <> 'disputed';
create view public.public_source_status with (security_invoker = true) as select code,display_name,adapter_mode,enabled,parser_version,last_success_at,last_error_code from public.sources;

alter table public.sources enable row level security; alter table public.clubs enable row level security; alter table public.club_aliases enable row level security; alter table public.players enable row level security; alter table public.source_player_identities enable row level security; alter table public.tournaments enable row level security; alter table public.results enable row level security; alter table public.result_revisions enable row level security; alter table public.source_refreshes enable row level security; alter table public.refresh_jobs enable row level security; alter table public.correction_requests enable row level security; alter table public.rule_sets enable row level security;
create policy "public reads sources" on public.sources for select to anon using (true);
create policy "public reads clubs" on public.clubs for select to anon using (true);
create policy "public reads players" on public.players for select to anon using (true);
create policy "public reads identities" on public.source_player_identities for select to anon using (match_status <> 'disputed');
create policy "public reads tournaments" on public.tournaments for select to anon using (true);
create policy "public reads results" on public.results for select to anon using (record_status <> 'disputed');
grant select on public.public_player_search, public.public_results, public.public_source_status to anon;
revoke all on public.result_revisions, public.source_refreshes, public.refresh_jobs, public.correction_requests, public.rule_sets from anon;
