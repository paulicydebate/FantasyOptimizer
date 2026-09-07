export interface Player {
  id: string;
  name: string;
  position: string;
  cost: number;
  points: number;
  team?: string;
}

export interface ColumnMapping {
  name: string;
  position: string;
  cost: string;
  points: string;
  team: string | null;
}

export interface RosterSlot {
  id: string;
  label: string;
  eligiblePositions: string[];
  count: number;
}

export interface RosterConfig {
  /** Roster spots per position, keyed by real position value (e.g. "RB") or the synthetic "FLEX" key. */
  positionCounts: Record<string, number>;
  budget: number;
  /** Players cheaper than this are ignored entirely (except required players). Null = no minimum. */
  minCost: number | null;
  /** Players pricier than this are ignored entirely (except required players). Null = no maximum. */
  maxCost: number | null;
  /** +/- percent to randomly jitter each player's cost by when running the price-variance simulation. 0 disables it. */
  costVariancePct: number;
}

export interface OptimizeResult {
  status: 'optimal' | 'infeasible' | 'error';
  message?: string;
  assignments: { slot: RosterSlot; player: Player }[];
  totalCost: number;
  totalPoints: number;
}

export interface PlayerInclusionStat {
  player: Player;
  /** Fraction (0-1) of successful simulation runs that included this player. */
  rate: number;
}

export interface SimulationSummary {
  /** How many of the requested runs found a feasible roster. */
  successfulRuns: number;
  requestedRuns: number;
  stats: PlayerInclusionStat[];
}
