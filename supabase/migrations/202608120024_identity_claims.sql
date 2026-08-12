create type public.identity_claim_status as enum ('pending', 'approved', 'rejected');

create table public.identity_claims (
  id uuid primary key default gen_random_uuid(),
  normalized_name text not null check (char_length(normalized_name) between 1 and 100),
  verification_hash text not null check (verification_hash ~ '^[0-9a-f]{64}$'),
  candidate_fingerprint text not null check (candidate_fingerprint ~ '^[0-9a-f]{64}$'),
  candidate_count smallint not null check (candidate_count between 1 and 10),
  note text check (note is null or char_length(note) between 10 and 500),
  status public.identity_claim_status not null default 'pending',
  reviewed_by text,
  reviewed_at timestamptz,
  review_note text check (review_note is null or char_length(review_note) between 3 and 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index identity_claims_review_queue_idx on public.identity_claims(status, created_at);
create index identity_claims_rate_limit_idx on public.identity_claims(verification_hash, created_at desc);

create table public.identity_claim_candidates (
  claim_id uuid not null references public.identity_claims on delete cascade,
  player_id bigint not null references public.players on delete restrict,
  created_at timestamptz not null default now(),
  primary key (claim_id, player_id)
);

create table public.identity_claim_reviews (
  id bigint generated always as identity primary key,
  claim_id uuid not null references public.identity_claims on delete cascade,
  previous_status public.identity_claim_status not null,
  next_status public.identity_claim_status not null,
  reviewed_by text,
  review_note text,
  created_at timestamptz not null default now()
);

create view public.identity_claim_review_queue with (security_invoker = true) as
select
  claim.id,
  claim.normalized_name,
  claim.candidate_count,
  claim.note,
  claim.status,
  claim.created_at,
  claim.reviewed_at,
  claim.reviewed_by,
  claim.review_note,
  jsonb_agg(jsonb_build_object(
    'player_public_id', player.public_id,
    'name', player.canonical_name,
    'region', player.primary_region,
    'club', club.canonical_name,
    'identity_status', player.identity_status
  ) order by player.public_id) candidates
from public.identity_claims claim
join public.identity_claim_candidates candidate on candidate.claim_id = claim.id
join public.players player on player.id = candidate.player_id
left join public.clubs club on club.id = player.primary_club_id
group by claim.id;

alter table public.identity_claims enable row level security;
alter table public.identity_claim_candidates enable row level security;
alter table public.identity_claim_reviews enable row level security;

revoke all on public.identity_claims, public.identity_claim_candidates, public.identity_claim_reviews, public.identity_claim_review_queue from public, anon, authenticated;
grant select on public.identity_claim_review_queue to service_role;

create or replace function public.submit_identity_claim_internal(
  p_player_public_ids uuid[],
  p_verification_hash text,
  p_candidate_fingerprint text,
  p_note text default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_candidate_count integer;
  v_name_count integer;
  v_normalized_name text;
  v_claim_id uuid;
  v_recent_count integer;
begin
  if coalesce(array_length(p_player_public_ids, 1), 0) not between 1 and 10
    or (
      select count(distinct value)
      from unnest(p_player_public_ids) as ids(value)
    ) <> array_length(p_player_public_ids, 1)
    or p_verification_hash !~ '^[0-9a-f]{64}$'
    or p_candidate_fingerprint !~ '^[0-9a-f]{64}$'
    or (p_note is not null and char_length(p_note) not between 10 and 500)
  then
    raise exception 'invalid_identity_claim';
  end if;

  select count(*), count(distinct normalized_name), min(normalized_name)
  into v_candidate_count, v_name_count, v_normalized_name
  from public.players
  where public_id = any(p_player_public_ids);

  if v_candidate_count <> array_length(p_player_public_ids, 1) or v_name_count <> 1 then
    raise exception 'identity_claim_candidates_mismatch';
  end if;

  select id into v_claim_id
  from public.identity_claims
  where verification_hash = p_verification_hash
    and candidate_fingerprint = p_candidate_fingerprint
    and created_at >= now() - interval '24 hours'
  order by created_at desc
  limit 1;
  if v_claim_id is not null then return v_claim_id; end if;

  select count(*) into v_recent_count
  from public.identity_claims
  where verification_hash = p_verification_hash
    and created_at >= now() - interval '24 hours';
  if v_recent_count >= 3 then raise exception 'identity_claim_rate_limited'; end if;

  select count(*) into v_recent_count
  from public.identity_claims
  where created_at >= now() - interval '10 minutes';
  if v_recent_count >= 30 then raise exception 'identity_claim_rate_limited'; end if;

  insert into public.identity_claims(
    normalized_name, verification_hash, candidate_fingerprint, candidate_count, note
  ) values (
    v_normalized_name, p_verification_hash, p_candidate_fingerprint, v_candidate_count, p_note
  ) returning id into v_claim_id;

  insert into public.identity_claim_candidates(claim_id, player_id)
  select v_claim_id, id
  from public.players
  where public_id = any(p_player_public_ids);

  return v_claim_id;
end;
$$;

revoke all on function public.submit_identity_claim_internal(uuid[], text, text, text) from public, anon, authenticated;
grant execute on function public.submit_identity_claim_internal(uuid[], text, text, text) to service_role;

create or replace function public.audit_identity_claim_review() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at = now();
  if old.status is distinct from new.status then
    new.reviewed_at = coalesce(new.reviewed_at, now());
    insert into public.identity_claim_reviews(
      claim_id, previous_status, next_status, reviewed_by, review_note
    ) values (
      old.id, old.status, new.status, new.reviewed_by, new.review_note
    );
  end if;
  return new;
end;
$$;

create trigger identity_claim_review_audit
before update on public.identity_claims
for each row execute function public.audit_identity_claim_review();

comment on column public.identity_claims.verification_hash is 'Server-only HMAC of normalized player name and a user-chosen four-digit private code. Raw digits are never stored.';
comment on table public.identity_claim_candidates is 'User-selected same-person candidates. A pending claim never merges players automatically.';
