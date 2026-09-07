import GLPK from 'glpk.js';
import type { LP } from 'glpk.js';
import type { OptimizeResult, Player, RosterConfig, RosterSlot } from '../types';

let glpkPromise: ReturnType<typeof GLPK> | null = null;
function getGlpk() {
  if (!glpkPromise) glpkPromise = GLPK();
  return glpkPromise;
}

/**
 * Expands each configured slot (which may have count > 1) into individual
 * slot instances so each can be assigned exactly one distinct player.
 */
function expandSlots(slots: RosterSlot[]): RosterSlot[] {
  const expanded: RosterSlot[] = [];
  for (const slot of slots) {
    for (let i = 0; i < slot.count; i++) {
      expanded.push({ ...slot, id: `${slot.id}__${i}` });
    }
  }
  return expanded;
}

export async function optimizeRoster(
  players: Player[],
  config: RosterConfig,
  requiredPlayerIds: Set<string>,
): Promise<OptimizeResult> {
  const glpk = await getGlpk();
  const slots = expandSlots(config.slots);

  if (slots.length === 0) {
    return { status: 'error', message: 'Add at least one roster slot.', assignments: [], totalCost: 0, totalPoints: 0 };
  }

  // Variable name for player i assigned to slot s.
  const varName = (playerId: string, slotId: string) => `x__${playerId}__${slotId}`;

  const eligiblePairs: { player: Player; slot: RosterSlot }[] = [];
  for (const slot of slots) {
    for (const player of players) {
      if (slot.eligiblePositions.includes(player.position)) {
        eligiblePairs.push({ player, slot });
      }
    }
  }

  const requiredMissing = [...requiredPlayerIds].filter(
    (id) => !eligiblePairs.some((p) => p.player.id === id),
  );
  if (requiredMissing.length > 0) {
    const names = requiredMissing
      .map((id) => players.find((p) => p.id === id)?.name ?? id)
      .join(', ');
    return {
      status: 'infeasible',
      message: `${names} ${requiredMissing.length === 1 ? "doesn't fit" : "don't fit"} any roster slot's eligible positions.`,
      assignments: [],
      totalCost: 0,
      totalPoints: 0,
    };
  }

  const objectiveVars = eligiblePairs.map(({ player, slot }) => ({
    name: varName(player.id, slot.id),
    coef: player.points,
  }));

  const subjectTo: LP['subjectTo'] = [];

  // Each slot filled by exactly one eligible player.
  for (const slot of slots) {
    const vars = eligiblePairs
      .filter((p) => p.slot.id === slot.id)
      .map(({ player }) => ({ name: varName(player.id, slot.id), coef: 1 }));
    subjectTo.push({
      name: `slot_${slot.id}`,
      vars,
      bnds: { type: glpk.GLP_FX, ub: 1, lb: 1 },
    });
  }

  // Each player used in at most one slot.
  for (const player of players) {
    const vars = eligiblePairs
      .filter((p) => p.player.id === player.id)
      .map(({ slot }) => ({ name: varName(player.id, slot.id), coef: 1 }));
    if (vars.length === 0) continue;
    subjectTo.push({
      name: `player_${player.id}`,
      vars,
      bnds: { type: glpk.GLP_UP, ub: 1, lb: 0 },
    });
  }

  // Budget constraint.
  subjectTo.push({
    name: 'budget',
    vars: eligiblePairs.map(({ player, slot }) => ({
      name: varName(player.id, slot.id),
      coef: player.cost,
    })),
    bnds: { type: glpk.GLP_UP, ub: config.budget, lb: 0 },
  });

  // Required players must be used (in some eligible slot).
  for (const playerId of requiredPlayerIds) {
    const vars = eligiblePairs
      .filter((p) => p.player.id === playerId)
      .map(({ slot }) => ({ name: varName(playerId, slot.id), coef: 1 }));
    subjectTo.push({
      name: `required_${playerId}`,
      vars,
      bnds: { type: glpk.GLP_FX, ub: 1, lb: 1 },
    });
  }

  const lp: LP = {
    name: 'roster',
    objective: {
      direction: glpk.GLP_MAX,
      name: 'total_points',
      vars: objectiveVars,
    },
    subjectTo,
    binaries: eligiblePairs.map(({ player, slot }) => varName(player.id, slot.id)),
  };

  const result = await glpk.solve(lp, { msglev: glpk.GLP_MSG_OFF });

  const status = result.result.status;
  const isOptimal = status === glpk.GLP_OPT || status === glpk.GLP_FEAS;

  if (!isOptimal) {
    return {
      status: 'infeasible',
      message: 'No roster satisfies these constraints. Try raising the budget or loosening slot requirements.',
      assignments: [],
      totalCost: 0,
      totalPoints: 0,
    };
  }

  const assignments: { slot: RosterSlot; player: Player }[] = [];
  for (const { player, slot } of eligiblePairs) {
    const value = result.result.vars[varName(player.id, slot.id)];
    if (value && value > 0.5) {
      assignments.push({ slot, player });
    }
  }

  const totalCost = assignments.reduce((sum, a) => sum + a.player.cost, 0);
  const totalPoints = assignments.reduce((sum, a) => sum + a.player.points, 0);

  return { status: 'optimal', assignments, totalCost, totalPoints };
}
