import { optimizeRoster } from './optimizer';
import type { Player, PlayerInclusionStat, RosterSlot, SimulationSummary } from '../types';

export const SIMULATION_RUNS = 150;

function jitterCost(cost: number, variancePct: number): number {
  const factor = 1 + (Math.random() * 2 - 1) * (variancePct / 100);
  return Math.max(0, Math.round(cost * factor));
}

/**
 * Re-solves the roster many times with each player's cost randomly perturbed by
 * +/- variancePct, to see which players remain good picks even if real auction
 * prices don't land exactly where the sheet predicts.
 */
export async function runPriceVarianceSimulation(
  players: Player[],
  slots: RosterSlot[],
  budget: number,
  requiredPlayerIds: Set<string>,
  variancePct: number,
  maxPerPosition: Record<string, number | null> = {},
  runs: number = SIMULATION_RUNS,
  onProgress?: (completed: number) => void,
): Promise<SimulationSummary> {
  const inclusionCounts = new Map<string, number>();
  let successfulRuns = 0;

  for (let i = 0; i < runs; i++) {
    const jittered = players.map((p) => ({ ...p, cost: jitterCost(p.cost, variancePct) }));
    const result = await optimizeRoster(jittered, slots, budget, requiredPlayerIds, maxPerPosition);
    if (result.status === 'optimal') {
      successfulRuns++;
      for (const { player } of result.assignments) {
        inclusionCounts.set(player.id, (inclusionCounts.get(player.id) ?? 0) + 1);
      }
    }
    onProgress?.(i + 1);
  }

  const stats: PlayerInclusionStat[] = [];
  if (successfulRuns > 0) {
    const byId = new Map(players.map((p) => [p.id, p]));
    for (const [playerId, count] of inclusionCounts) {
      const player = byId.get(playerId);
      if (player) stats.push({ player, rate: count / successfulRuns });
    }
    stats.sort((a, b) => b.rate - a.rate || b.player.points - a.player.points);
  }

  return { successfulRuns, requestedRuns: runs, stats };
}
