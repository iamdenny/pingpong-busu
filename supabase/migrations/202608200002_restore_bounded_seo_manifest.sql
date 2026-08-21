-- Restore the bounded identity-only SEO manifest.
--
-- 202608200001 added a per-player record snapshot (recent division, recent
-- awards, source names, last checked). In production the extended view could
-- not answer even a `limit 1` request inside the statement timeout (57014):
-- the generator enumerates the whole view, so every added per-player lateral
-- multiplies across ~13k groups and 27 pages. The record snapshot needs a
-- precomputed source rather than a wider view, so the cheap definition from
-- 202608150008 is restored here and the static pages fall back to the identity
-- summary until that design lands.

-- create or replace cannot remove the record columns (42P16), so the view is
-- dropped and rebuilt. Nothing else depends on it: the deployment-time SEO
-- generator and the public read health check are its only readers.
drop view if exists public.public_player_seo_manifest;

create view public.public_player_seo_manifest with (security_invoker = true) as
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
