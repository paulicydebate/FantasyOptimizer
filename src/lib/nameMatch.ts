import type { Player } from '../types';

function normalize(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '') // strip accents
    .replace(/[.'-]/g, '')
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Finds the uploaded player row that best matches an externally-sourced name
 * (e.g. from Sleeper). Returns null when there's no confident single match,
 * so the caller can fall back to asking the person to resolve it by hand.
 */
export function findPlayerMatch(searchName: string, position: string | undefined, players: Player[]): Player | null {
  const target = normalize(searchName);
  if (!target) return null;

  const exactMatches = players.filter((p) => normalize(p.name) === target);
  if (exactMatches.length === 1) return exactMatches[0];
  if (exactMatches.length > 1 && position) {
    const scoped = exactMatches.find((p) => p.position.toUpperCase() === position.toUpperCase());
    if (scoped) return scoped;
  }
  if (exactMatches.length === 1) return exactMatches[0];

  // Loose containment fallback - mainly for defenses, where naming conventions
  // vary a lot ("San Francisco" vs "San Francisco 49ers" vs "SF").
  const contains = players.filter(
    (p) => normalize(p.name).includes(target) || target.includes(normalize(p.name)),
  );
  if (contains.length === 1) return contains[0];

  return null;
}
