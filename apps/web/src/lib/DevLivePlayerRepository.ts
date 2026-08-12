import { z } from 'zod';
import { divisionSystemSchema, type PlayerDetail, type PlayerSummary, type SourceStatus } from '@busu/domain';
import type { PlayerRepository, PlayerSearchInput, RefreshRequest, RefreshResponse, RefreshStatus } from './repository';

const summarySchema = z.object({
  id: z.string(), name: z.string(), normalizedName: z.string(), region: z.string().optional(), club: z.string().optional(),
  recentObservedDivision: z.string().optional(), recentObservedDivisionSystem: divisionSystemSchema.optional(), resultCount: z.number(), sourceCount: z.number(), lastCheckedAt: z.string(),
  identityStatus: z.enum(['unreviewed', 'likely', 'verified', 'disputed']), dataKind: z.literal('live').optional(),
});

export class DevLivePlayerRepository implements PlayerRepository {
  async listSourceStatuses(): Promise<SourceStatus[]> {
    return [
      { sourceCode: 'astree', displayName: '애즈트리', baseUrl: 'https://astree.co.kr/', adapterMode: 'http', enabled: true, parserVersion: 'astree-3' },
      { sourceCode: 'ttadivision', displayName: '대한탁구협회 디비전', baseUrl: 'https://ttadivision.sports.or.kr/', adapterMode: 'http', enabled: true, parserVersion: 'ttadivision-1' },
      { sourceCode: 'airping', displayName: '에어핑퐁', baseUrl: 'https://airping.co.kr/', adapterMode: 'http', enabled: false, parserVersion: 'airping-1' },
      { sourceCode: 'okpingpong', displayName: '오케이핑퐁', baseUrl: 'http://okpingpong.co.kr/', adapterMode: 'http', enabled: false, parserVersion: 'okpingpong-1' },
      { sourceCode: 'mytt', displayName: '마이티티', baseUrl: 'https://mytt.kr/', adapterMode: 'http', enabled: true, parserVersion: 'mytt-1' },
    ];
  }
  async searchPlayers(input: PlayerSearchInput): Promise<PlayerSummary[]> {
    const response = await fetch(`/api/dev/players?query=${encodeURIComponent(input.query)}`);
    if (!response.ok) throw new Error('개발용 저장 결과를 불러오지 못했습니다.');
    return z.array(summarySchema).parse(await response.json()).map((row) => ({
      id: row.id, name: row.name, normalizedName: row.normalizedName,
      ...(row.region ? { region: row.region } : {}), ...(row.club ? { club: row.club } : {}),
      ...(row.recentObservedDivision ? { recentObservedDivision: row.recentObservedDivision } : {}),
      ...(row.recentObservedDivisionSystem ? { recentObservedDivisionSystem: row.recentObservedDivisionSystem } : {}),
      resultCount: row.resultCount, sourceCount: row.sourceCount, lastCheckedAt: row.lastCheckedAt,
      identityStatus: row.identityStatus, ...(row.dataKind ? { dataKind: row.dataKind } : {}),
    }));
  }
  async getPlayer(id: string): Promise<PlayerDetail | null> {
    const response = await fetch(`/api/dev/players/${encodeURIComponent(id)}`);
    if (response.status === 404) return null;
    if (!response.ok) throw new Error('개발용 선수 상세를 불러오지 못했습니다.');
    return await response.json() as PlayerDetail;
  }
  async requestRefresh(input: RefreshRequest): Promise<RefreshResponse> {
    const sourceCode = input.sourceCodes?.[0] ?? 'astree';
    if (sourceCode !== 'astree') return { refreshId: `dev-${sourceCode}-${Date.now()}`, accepted: true, recordsFound: 0, sources: [{ sourceCode, status: 'skipped', reason: 'source_disabled' }] };
    const response = await fetch('/api/dev/refresh', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: input.name, force: input.force ?? false }) });
    if (!response.ok) throw new Error('애즈트리 공개 기록 갱신에 실패했습니다.');
    const parsed = z.object({ refreshId: z.string(), accepted: z.boolean(), recordsFound: z.number().optional(), candidatesFound: z.number().optional() }).parse(await response.json());
    return { refreshId: parsed.refreshId, accepted: parsed.accepted, ...(parsed.recordsFound !== undefined ? { recordsFound: parsed.recordsFound } : {}), ...(parsed.candidatesFound !== undefined ? { candidatesFound: parsed.candidatesFound } : {}), sources: [{ sourceCode: 'astree', status: 'succeeded', ...(parsed.recordsFound !== undefined ? { found: parsed.recordsFound } : {}) }] };
  }
  async getRefreshStatus(refreshId: string): Promise<RefreshStatus> { return { refreshId, state: 'completed' }; }
}
