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
  slots: RosterSlot[];
  budget: number;
}

export interface OptimizeResult {
  status: 'optimal' | 'infeasible' | 'error';
  message?: string;
  assignments: { slot: RosterSlot; player: Player }[];
  totalCost: number;
  totalPoints: number;
}
