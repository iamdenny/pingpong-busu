import { normalizeSearchText, sortPlayerRecordsByLatest, type SourceStatus } from '@busu/domain';
import type { PlayerRepository, PlayerSearchInput, RefreshRequest, RefreshResponse, RefreshStatus } from '../lib/repository';
import { demoPlayers } from './data';

export class DemoPlayerRepository implements PlayerRepository {
  async listSourceStatuses(): Promise<SourceStatus[]> {
    return [
      { sourceCode: 'astree', displayName: '애즈트리', baseUrl: 'https://astree.co.kr/', adapterMode: 'http', enabled: true, parserVersion: 'astree-3' },
      { sourceCode: 'ttadivision', displayName: '대한탁구협회 디비전', baseUrl: 'https://ttadivision.sports.or.kr/', adapterMode: 'http', enabled: true, parserVersion: 'ttadivision-1' },
      { sourceCode: 'airping', displayName: '에어핑퐁', baseUrl: 'https://airping.co.kr/', adapterMode: 'http', enabled: false, parserVersion: 'airping-1' },
      { sourceCode: 'okpingpong', displayName: '오케이핑퐁', baseUrl: 'http://okpingpong.co.kr/', adapterMode: 'http', enabled: false, parserVersion: 'okpingpong-1' },
      { sourceCode: 'mytt', displayName: '마이티티', baseUrl: 'https://mytt.kr/', adapterMode: 'http', enabled: true, parserVersion: 'mytt-1' },
    ];
  }
  async searchPlayers(input: PlayerSearchInput) {
    const query = normalizeSearchText(input.query);
    return demoPlayers.filter((player) => [player.normalizedName, normalizeSearchText(player.club ?? ''), normalizeSearchText(player.region ?? '')].some((value) => value.startsWith(query)) && (!input.region || player.region === input.region) && (!input.club || player.club === input.club) && (!input.sourceCode || player.sources.some((source) => source.sourceCode === input.sourceCode))).map((player) => ({ id:player.id,name:player.name,normalizedName:player.normalizedName,...(player.region?{region:player.region}:{}),...(player.club?{club:player.club}:{}),...(player.recentObservedDivision?{recentObservedDivision:player.recentObservedDivision}:{}),...(player.recentObservedDivisionSystem?{recentObservedDivisionSystem:player.recentObservedDivisionSystem}:{}),resultCount:player.resultCount,sourceCount:player.sourceCount,lastCheckedAt:player.lastCheckedAt,identityStatus:player.identityStatus }));
  }
  async getPlayer(id: string) {
    const player = demoPlayers.find((candidate) => candidate.id === id);
    return player ? { ...player, records: sortPlayerRecordsByLatest(player.records) } : null;
  }
  async requestRefresh(input: RefreshRequest): Promise<RefreshResponse> { return { refreshId: `demo-${Date.now()}`, accepted: true, recordsFound: 0, candidatesFound: 0, sources: (input.sourceCodes ?? []).map((sourceCode) => ({ sourceCode, status: 'skipped', reason: 'demo_mode' })) }; }
  async getRefreshStatus(refreshId: string): Promise<RefreshStatus> { return { refreshId, state: 'partial' }; }
}
