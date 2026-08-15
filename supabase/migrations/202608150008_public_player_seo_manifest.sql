-- Keep deployment-time SEO enumeration independent from the rich search view.
-- This view exposes only the bounded metadata required for static player pages.

create or replace view public.public_player_seo_manifest with (security_invoker = true) as
select
  p.public_id::text id,
  p.canonical_name,
  p.homonym_nickname,
  (array_agg(
    nullif(btrim(spi.source_region), '')
    order by spi.last_checked_at desc, spi.id desc
  ) filter (
    where s.code <> 'iping'
      and nullif(btrim(spi.source_region), '') is not null
  ))[1] primary_region,
  coalesce(
    c.canonical_name,
    (array_agg(
      nullif(btrim(spi.source_club_text), '')
      order by spi.last_checked_at desc, spi.id desc
    ) filter (where nullif(btrim(spi.source_club_text), '') is not null))[1]
  ) primary_club,
  count(distinct r.id) filter (where public.is_award_rank(r.rank_text))::integer result_count,
  count(distinct r.source_id)::integer source_count
from public.players p
join public.source_player_identities spi
  on spi.player_id = p.id
  and spi.match_status <> 'disputed'
join public.sources s on s.id = spi.source_id
join public.results r
  on r.source_player_identity_id = spi.id
  and r.record_status <> 'disputed'
left join public.clubs c on c.id = p.primary_club_id
where p.merged_into_player_id is null
group by p.id, c.canonical_name;

grant select on public.public_player_seo_manifest to anon;

comment on view public.public_player_seo_manifest is
  'Bounded public player metadata used only for deployment-time SEO snapshots.';

notify pgrst, 'reload schema';
