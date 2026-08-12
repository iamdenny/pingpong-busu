import type { PlayerSummary } from './models';

export function findIdentityCandidates(players: readonly PlayerSummary[], normalizedName: string): PlayerSummary[] {
  return players.filter((player) => player.normalizedName === normalizedName);
}

export function mayAutoMerge(left: PlayerSummary, right: PlayerSummary): boolean {
  void left;
  void right;
  return false;
}
