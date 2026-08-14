import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { SupabasePlayerRepository } from "./SupabasePlayerRepository";

describe("SupabasePlayerRepository player search", () => {
  it("accepts a user-entered homonym nickname from the public search view", async () => {
    const row = {
      id: "candidate-1",
      canonical_name: "임대현",
      normalized_name: "임대현",
      primary_region: "용인",
      primary_club: null,
      recent_observed_division: "6부",
      recent_observed_division_system: "open",
      result_count: 15,
      award_results: [
        {
          rank: "우승",
          date: "2026-08-12",
          tournament: "2026 합성 오픈",
          last_checked_at: "2026-08-13T00:00:00.000Z",
        },
      ],
      latest_participation_date: "2026-08-11",
      latest_participation_tournament: "2026 합성 생활체육대회",
      latest_participation_checked_at: "2026-08-12T00:00:00.000Z",
      division_observations: [],
      source_count: 7,
      last_checked_at: "2026-08-13T00:00:00.000Z",
      identity_status: "verified",
      homonym_nickname: "데니",
    };
    const searchQuery = {
      select: vi.fn(),
      ilike: vi.fn(),
      order: vi.fn(),
      range: vi.fn(),
    };
    searchQuery.select.mockReturnValue(searchQuery);
    searchQuery.ilike.mockReturnValue(searchQuery);
    searchQuery.order.mockReturnValue(searchQuery);
    searchQuery.range.mockResolvedValue({ data: [row], error: null });
    const client = { from: vi.fn().mockReturnValue(searchQuery) };
    const repository = new SupabasePlayerRepository(
      client as unknown as SupabaseClient,
    );

    await expect(
      repository.searchPlayers({ query: "임대현" }),
    ).resolves.toEqual([
      expect.objectContaining({
        id: "candidate-1",
        name: "임대현",
        homonymNickname: "데니",
        latestParticipationDate: "2026-08-11",
        latestParticipationTournament: "2026 합성 생활체육대회",
        latestParticipationCheckedAt: "2026-08-12T00:00:00.000Z",
        awardResults: [
          {
            rank: "우승",
            date: "2026-08-12",
            tournament: "2026 합성 오픈",
            lastCheckedAt: "2026-08-13T00:00:00.000Z",
          },
        ],
      }),
    ]);
  });
});

describe("SupabasePlayerRepository identity evidence", () => {
  it("falls back to the public results view when the evidence RPC is unavailable", async () => {
    const row = {
      id: "record-1",
      player_public_id: "candidate-1",
      tournament_name_text: "재조회 성공 대회",
      event_name: "개인단식 6부",
      event_type: "singles",
      division_system: "integrated",
      division_value: "6부",
      rank_text: null,
      club_text: "스핀탁구클럽",
      source_url: "https://example.com/record-1",
      source_code: "astree",
      source_name: "애즈트리",
      tournament_scale: "district",
      tournament_date: "2026-08-13",
      source_published_date: null,
      sort_date: "2026-08-13",
      last_checked_at: "2026-08-13T00:00:00.000Z",
      first_seen_at: "2026-08-13T00:00:00.000Z",
    };
    const fallbackQuery = {
      select: vi.fn(),
      in: vi.fn(),
      order: vi.fn(),
      limit: vi.fn(),
    };
    fallbackQuery.select.mockReturnValue(fallbackQuery);
    fallbackQuery.in.mockReturnValue(fallbackQuery);
    fallbackQuery.order.mockReturnValue(fallbackQuery);
    fallbackQuery.limit.mockResolvedValue({ data: [row], error: null });
    const client = {
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { message: "function does not exist" },
      }),
      from: vi.fn().mockReturnValue(fallbackQuery),
    };
    const repository = new SupabasePlayerRepository(
      client as unknown as SupabaseClient,
    );

    await expect(
      repository.getIdentityCandidateEvidence(["candidate-1"]),
    ).resolves.toEqual([
      {
        candidateId: "candidate-1",
        status: "loaded",
        records: [
          expect.objectContaining({
            id: "record-1",
            tournament: "재조회 성공 대회",
            event: "개인단식 6부",
          }),
        ],
      },
    ]);
    expect(client.rpc).toHaveBeenCalledWith(
      "list_identity_candidate_evidence",
      { p_player_public_ids: ["candidate-1"] },
    );
    expect(client.from).toHaveBeenCalledWith("public_results");
  });

  it("accepts a successful identity edit with one alias group", async () => {
    const client = {
      functions: {
        invoke: vi.fn().mockResolvedValue({
          data: {
            accepted: true,
            referenceId: "ONEALIAS",
            operationId: "00000000-0000-4000-8000-000000000001",
            status: "applied",
            groupCount: 1,
          },
          error: null,
        }),
      },
    };
    const repository = new SupabasePlayerRepository(
      client as unknown as SupabaseClient,
    );

    await expect(
      repository.applyIdentityEdit({
        groups: [
          {
            nickname: "용인 치키타",
            candidateIds: ["candidate-1"],
          },
        ],
        editorId: "00000000-0000-4000-8000-000000000002",
      }),
    ).resolves.toEqual(expect.objectContaining({ groupCount: 1 }));
  });

  it("surfaces a specific message for stale identity candidates", async () => {
    const client = {
      functions: {
        invoke: vi.fn().mockResolvedValue({
          data: null,
          error: {
            name: "FunctionsHttpError",
            context: new Response(
              JSON.stringify({ error: "stale_candidates" }),
              {
                status: 409,
                headers: { "Content-Type": "application/json" },
              },
            ),
          },
        }),
      },
    };
    const repository = new SupabasePlayerRepository(
      client as unknown as SupabaseClient,
    );

    await expect(
      repository.applyIdentityEdit({
        groups: [
          {
            nickname: "용인 치키타",
            candidateIds: ["candidate-1"],
          },
        ],
        editorId: "00000000-0000-4000-8000-000000000002",
      }),
    ).rejects.toThrow("선택한 기록이 최근 편집으로 변경되었습니다");
  });
});
