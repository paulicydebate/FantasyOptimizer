import type { RosterConfig, RosterSlot } from '../types';

export const FLEX_KEY = 'FLEX';
export const FLEX_ELIGIBLE = new Set(['RB', 'WR', 'TE']);

export function flexPositions(availablePositions: string[]): string[] {
  return availablePositions.filter((p) => FLEX_ELIGIBLE.has(p.toUpperCase()));
}

/** Converts the position-count map into the slot list the optimizer solves against. */
export function buildRosterSlots(config: RosterConfig, availablePositions: string[]): RosterSlot[] {
  const slots: RosterSlot[] = [];

  for (const position of availablePositions) {
    const count = config.positionCounts[position] ?? 0;
    if (count > 0) {
      slots.push({ id: position, label: position, eligiblePositions: [position], count });
    }
  }

  const flexCount = config.positionCounts[FLEX_KEY] ?? 0;
  const flexEligible = flexPositions(availablePositions);
  if (flexCount > 0 && flexEligible.length > 0) {
    slots.push({ id: FLEX_KEY, label: FLEX_KEY, eligiblePositions: flexEligible, count: flexCount });
  }

  return slots;
}

export function totalRosterSpots(config: RosterConfig): number {
  return Object.values(config.positionCounts).reduce((sum, n) => sum + (n || 0), 0);
}
