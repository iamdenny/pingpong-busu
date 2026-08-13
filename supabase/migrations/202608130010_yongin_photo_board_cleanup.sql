-- Kakao cafe search snippets flatten several awardees into one text fragment.
-- The IWou board contains awardee photos, not player-scoped result rows, so
-- records inferred from it cannot safely associate a division or rank.
update public.results result
set record_status = 'disputed',
    updated_at = now()
from public.sources source
where source.id = result.source_id
  and source.code = 'yongintt'
  and result.record_status <> 'disputed'
  and (
    lower(result.source_url) like 'https://cafe.daum.net/yongintt/iwou/%'
    or lower(result.source_url) like 'https://m.cafe.daum.net/yongintt/iwou/%'
    or result.tournament_name_text ~ '입상자[[:space:]]*사진|수상자[[:space:]]*사진'
  );

-- A Yongin source identity is scoped to one post URL. Hide identities that no
-- longer have any trustworthy result while retaining the audit trail.
update public.source_player_identities identity
set match_status = 'disputed',
    updated_at = now()
from public.sources source
where source.id = identity.source_id
  and source.code = 'yongintt'
  and identity.match_status <> 'disputed'
  and (
    lower(identity.source_url) like 'https://cafe.daum.net/yongintt/iwou/%'
    or lower(identity.source_url) like 'https://m.cafe.daum.net/yongintt/iwou/%'
  )
  and not exists (
    select 1
    from public.results result
    where result.source_player_identity_id = identity.id
      and result.record_status <> 'disputed'
  );

update public.sources
set parser_version = 'yongintt-2',
    updated_at = now()
where code = 'yongintt';
