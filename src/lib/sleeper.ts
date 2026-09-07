const BASE = 'https://api.sleeper.app/v1';

export interface SleeperDraft {
  draft_id: string;
  status: string; // 'pre_draft' | 'drafting' | 'paused' | 'complete'
  type: string; // 'snake' | 'auction' | 'linear'
  season: string;
  start_time: number | null;
}

export interface SleeperUser {
  user_id: string;
  display_name: string;
  metadata?: { team_name?: string } | null;
}

export interface SleeperPick {
  pick_no: number;
  player_id: string;
  picked_by: string;
  roster_id: number | string | null;
  metadata: Record<string, string> | null;
}

async function get<T>(path: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`);
  } catch {
    throw new Error(
      "Couldn't reach Sleeper's API from this page. This is usually a network hiccup, or Sleeper's server " +
        "declining a cross-origin request from this domain (CORS) - open the browser console for the exact error.",
    );
  }
  if (!res.ok) {
    if (res.status === 404) throw new Error('Not found - double check the league ID.');
    throw new Error(`Sleeper API returned an error (HTTP ${res.status}).`);
  }
  return res.json() as Promise<T>;
}

export function getLeagueDrafts(leagueId: string): Promise<SleeperDraft[]> {
  return get<SleeperDraft[]>(`/league/${leagueId}/drafts`);
}

export function getLeagueUsers(leagueId: string): Promise<SleeperUser[]> {
  return get<SleeperUser[]>(`/league/${leagueId}/users`);
}

export function getDraftPicks(draftId: string): Promise<SleeperPick[]> {
  return get<SleeperPick[]>(`/draft/${draftId}/picks`);
}

export function sleeperUserLabel(user: SleeperUser): string {
  return user.metadata?.team_name || user.display_name || user.user_id;
}

/** Best-effort display name for a pick, built from whatever metadata Sleeper sent back. */
export function sleeperPickName(pick: SleeperPick): string {
  const meta = pick.metadata ?? {};
  const name = [meta.first_name, meta.last_name].filter(Boolean).join(' ').trim();
  return name || `Player ${pick.player_id}`;
}

/** Auction bid amount for a pick, if present. Sleeper sends metadata values as strings. */
export function sleeperPickAmount(pick: SleeperPick): number | null {
  const raw = pick.metadata?.amount;
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  return Number.isNaN(n) ? null : n;
}
