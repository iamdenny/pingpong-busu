create index if not exists source_identity_player_status_source_idx
  on public.source_player_identities(player_id, match_status, source_id);

create index if not exists results_status_identity_source_idx
  on public.results(record_status, source_player_identity_id, source_id);

