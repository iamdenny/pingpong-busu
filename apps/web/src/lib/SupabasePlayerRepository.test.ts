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
          event: "여자 개인단식 6부",
          last_checked_at: "2026-08-13T00:00:00.000Z",
        },
      ],
      latest_participation_date: "2026-08-11",
      latest_participation_tournament: "2026 합성 생활체육대회",
      latest_participation_event: "혼합복식 B그룹(합 15~19부)",
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
        latestParticipationEvent: "혼합복식 B그룹(합 15~19부)",
        latestParticipationCheckedAt: "2026-08-12T00:00:00.000Z",
        awardResults: [
          {
            rank: "우승",
            date: "2026-08-12",
            tournament: "2026 합성 오픈",
            event: "여자 개인단식 6부",
            lastCheckedAt: "2026-08-13T00:00:00.000Z",
          },
        ],
      }),
    ]);
  });
});

describe("SupabasePlayerRepository source refresh", () => {
  it("accepts a queued iPing refresh without treating it as a failure", async () => {
    const client = {
      functions: {
        invoke: vi.fn().mockResolvedValue({
          data: {
            refreshId: "job:42",
            sources: [
              {
                sourceCode: "iping",
                status: "queued",
                reason: "queued",
                message: "아이핑 최신 기록 수집을 예약했습니다.",
              },
            ],
          },
          error: null,
        }),
      },
    };
    const repository = new SupabasePlayerRepository(
      client as unknown as SupabaseClient,
    );

    await expect(
      repository.requestRefresh({
        name: "임대현",
        sourceCodes: ["iping"],
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        refreshId: "job:42",
        sources: [
          expect.objectContaining({
            sourceCode: "iping",
            status: "queued",
            reason: "queued",
          }),
        ],
      }),
    );
  });

  it("accepts the full six-hour iPing worker circuit delay", async () => {
    const client = {
      functions: {
        invoke: vi.fn().mockResolvedValue({
          data: {
            refreshId: 0,
            sources: [
              {
                sourceCode: "iping",
                status: "failed",
                errorCode: "source_circuit_open",
                message: "반복된 인증 오류로 아이핑 조회를 잠시 보호합니다.",
                retryAfterMs: 21_600_000,
              },
            ],
          },
          error: null,
        }),
      },
    };
    const repository = new SupabasePlayerRepository(
      client as unknown as SupabaseClient,
    );

    await expect(
      repository.requestRefresh({
        name: "김탁구",
        sourceCodes: ["iping"],
        force: true,
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        sources: [expect.objectContaining({ retryAfterMs: 21_600_000 })],
      }),
    );
  });
});

describe("SupabasePlayerRepository identity evidence", () => {
  it("falls back to the public results view when the evidence RPC is unavailable", async () => {
    const row = {
      id: "record-1",
      player_public_id: "candidate-1",
      tournament_name_text: "재조회 성공 대회",
      event_name: "여자 개인단식 6부",
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
      tournament_region: "경기도 용인시",
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
            tournamentRegion: "경기도 용인시",
            event: "여자 개인단식 6부",
            divisionSystem: "women",
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

describe("SupabasePlayerRepository player detail", () => {
  it("keeps one display record with every cross-source URL and source comparison", async () => {
    const summaryRow = {
      id: "candidate-grouped",
      canonical_name: "임대현",
      normalized_name: "임대현",
      primary_region: "분당구",
      primary_club: "조경환탁구클럽",
      recent_observed_division: "6부",
      recent_observed_division_system: "integrated",
      result_count: 1,
      award_results: [],
      latest_participation_date: null,
      latest_participation_tournament: null,
      latest_participation_event: null,
      latest_participation_checked_at: null,
      division_observations: [],
      source_count: 2,
      last_checked_at: "2026-08-16T00:00:00.000Z",
      identity_status: "verified",
      homonym_nickname: "데니",
    };
    const groupedRow = {
      id: "group-1",
      tournament_name_text: "2025년 화성특례시 코리요 탁구대회",
      event_name: "[남(혼)단식] 남자6~7부",
      event_type: "singles",
      division_system: "integrated",
      effective_division_system: "integrated",
      division_value: "6부",
      rank_text: "준우승",
      club_text: "조경환탁구클럽",
      partner_text: null,
      source_url: "https://example.com/astree",
      source_code: "astree",
      source_name: "애즈트리",
      tournament_scale: "district",
      tournament_date: "2025-08-09",
      tournament_region: "경기도 화성시",
      source_published_date: null,
      sort_date: "2025-08-09",
      last_checked_at: "2026-08-16T00:00:00.000Z",
      first_seen_at: "2026-08-15T00:00:00.000Z",
      sources: [
        {
          original_record_id: "astree-1",
          source_code: "astree",
          source_name: "애즈트리",
          source_url: "https://example.com/astree",
          club_text: "조경환탁구클럽",
          rank_text: "준우승",
          last_checked_at: "2026-08-16T00:00:00.000Z",
        },
        {
          original_record_id: "airping-1",
          source_code: "airping",
          source_name: "에어핑퐁",
          source_url: "https://example.com/airping",
          club_text: "코리요탁구클럽",
          rank_text: "2위",
          last_checked_at: "2026-08-15T00:00:00.000Z",
        },
      ],
    };
    const summaryQuery = {
      select: vi.fn(),
      eq: vi.fn(),
      maybeSingle: vi.fn(),
    };
    summaryQuery.select.mockReturnValue(summaryQuery);
    summaryQuery.eq.mockReturnValue(summaryQuery);
    summaryQuery.maybeSingle.mockResolvedValue({
      data: summaryRow,
      error: null,
    });
    const recordsQuery = {
      select: vi.fn(),
      eq: vi.fn(),
      order: vi.fn(),
      limit: vi.fn(),
    };
    recordsQuery.select.mockReturnValue(recordsQuery);
    recordsQuery.eq.mockReturnValue(recordsQuery);
    recordsQuery.order.mockReturnValue(recordsQuery);
    recordsQuery.limit.mockResolvedValue({ data: [groupedRow], error: null });
    const client = {
      from: vi
        .fn()
        .mockReturnValueOnce(summaryQuery)
        .mockReturnValueOnce(recordsQuery),
    };
    const repository = new SupabasePlayerRepository(
      client as unknown as SupabaseClient,
    );

    const detail = await repository.getPlayer("candidate-grouped");

    expect(detail?.records).toHaveLength(1);
    expect(detail?.records[0]?.sources).toHaveLength(2);
    expect(detail?.sources.map((source) => source.sourceCode).sort()).toEqual([
      "airping",
      "astree",
    ]);
    expect(detail?.sources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceCode: "airping",
          latestClub: "코리요탁구클럽",
          latestRank: "2위",
        }),
      ]),
    );
  });

  it("keeps a historical regional award but omits it from source recent-summary fields", async () => {
    const summaryRow = {
      id: "candidate-historical",
      canonical_name: "김탁구",
      normalized_name: "김탁구",
      primary_region: "서울특별시",
      primary_club: null,
      recent_observed_division: null,
      recent_observed_division_system: null,
      result_count: 0,
      award_results: [],
      latest_participation_date: null,
      latest_participation_tournament: null,
      latest_participation_event: null,
      latest_participation_checked_at: null,
      division_observations: [],
      source_count: 1,
      last_checked_at: "2026-08-13T00:00:00.000Z",
      identity_status: "unreviewed",
      homonym_nickname: null,
    };
    const historicalRow = {
      id: "record-historical",
      tournament_name_text: "2021 서울시 생활체육 탁구대회",
      event_name: "남자 개인단식 6부",
      event_type: "singles",
      division_system: "integrated",
      effective_division_system: "regional",
      division_value: "6부",
      rank_text: "우승",
      club_text: "합성탁구클럽",
      source_url: "https://example.com/historical",
      source_code: "astree",
      source_name: "애즈트리",
      tournament_scale: "district",
      tournament_date: "2021-06-01",
      tournament_region: "서울특별시",
      source_published_date: null,
      sort_date: "2021-06-01",
      last_checked_at: "2026-08-13T00:00:00.000Z",
      first_seen_at: "2026-08-13T00:00:00.000Z",
    };
    const summaryQuery = {
      select: vi.fn(),
      eq: vi.fn(),
      maybeSingle: vi.fn(),
    };
    summaryQuery.select.mockReturnValue(summaryQuery);
    summaryQuery.eq.mockReturnValue(summaryQuery);
    summaryQuery.maybeSingle.mockResolvedValue({
      data: summaryRow,
      error: null,
    });
    const recordsQuery = {
      select: vi.fn(),
      eq: vi.fn(),
      order: vi.fn(),
      limit: vi.fn(),
    };
    recordsQuery.select.mockReturnValue(recordsQuery);
    recordsQuery.eq.mockReturnValue(recordsQuery);
    recordsQuery.order.mockReturnValue(recordsQuery);
    recordsQuery.limit.mockResolvedValue({
      data: [historicalRow],
      error: null,
    });
    const client = {
      from: vi
        .fn()
        .mockReturnValueOnce(summaryQuery)
        .mockReturnValueOnce(recordsQuery),
    };
    const repository = new SupabasePlayerRepository(
      client as unknown as SupabaseClient,
    );

    const detail = await repository.getPlayer("candidate-historical");

    expect(detail?.records).toEqual([
      expect.objectContaining({
        division: "6부",
        divisionSystem: "regional",
        tournamentRegion: "서울특별시",
      }),
    ]);
    expect(detail?.sources).toEqual([
      expect.objectContaining({ resultCount: 0 }),
    ]);
    expect(detail?.sources[0]).not.toHaveProperty("recentObservedDivision");
    expect(detail?.sources[0]).not.toHaveProperty("latestRank");
    expect(detail?.sources[0]).not.toHaveProperty("latestRecordDate");
  });
});
