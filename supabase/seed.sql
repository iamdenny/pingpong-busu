update public.sources
set enabled = (code = 'mock'),
    updated_at = now();

insert into public.clubs(canonical_name, normalized_name, region)
values
  ('스핀탁구클럽', '스핀탁구클럽', '서울'),
  ('블루라켓', '블루라켓', '부산'),
  ('드라이브탁구회', '드라이브탁구회', '경기')
on conflict (normalized_name) do update
set canonical_name = excluded.canonical_name,
    region = excluded.region,
    updated_at = now();

insert into public.players(
  canonical_name,
  normalized_name,
  primary_club_id,
  primary_region,
  identity_status
)
select
  seed_player.canonical_name,
  seed_player.normalized_name,
  club.id,
  seed_player.primary_region,
  seed_player.identity_status::public.identity_status
from (
  values
    ('김탁구', '김탁구', '스핀탁구클럽', '서울', 'likely'),
    ('김탁구', '김탁구', '블루라켓', '부산', 'unreviewed'),
    ('이라켓', '이라켓', '드라이브탁구회', '경기', 'verified')
) as seed_player(
  canonical_name,
  normalized_name,
  club_normalized_name,
  primary_region,
  identity_status
)
join public.clubs club
  on club.normalized_name = seed_player.club_normalized_name
where not exists (
  select 1
  from public.players player
  where player.normalized_name = seed_player.normalized_name
    and player.primary_club_id = club.id
);
