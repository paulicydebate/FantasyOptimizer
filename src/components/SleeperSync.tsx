import { useEffect, useRef, useState } from 'react';
import { findPlayerMatch } from '../lib/nameMatch';
import {
  getDraftPicks,
  getLeagueDrafts,
  getLeagueUsers,
  sleeperPickAmount,
  sleeperPickName,
  sleeperUserLabel,
} from '../lib/sleeper';
import type { SleeperDraft, SleeperPick, SleeperUser } from '../lib/sleeper';
import type { Player } from '../types';

const POLL_MS = 5000;

interface LogEntry {
  pickNo: number;
  text: string;
  kind: 'me' | 'opponent' | 'unmatched';
}

interface Props {
  players: Player[];
  onDraftedByMe: (playerId: string, pricePaid: number) => void;
  onDraftedByOpponent: (playerId: string) => void;
}

export function SleeperSync({ players, onDraftedByMe, onDraftedByOpponent }: Props) {
  const [leagueId, setLeagueId] = useState('');
  const [status, setStatus] = useState<'idle' | 'connecting' | 'connected'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<SleeperDraft[]>([]);
  const [selectedDraftId, setSelectedDraftId] = useState('');
  const [users, setUsers] = useState<SleeperUser[]>([]);
  const [myUserId, setMyUserId] = useState('');
  const [live, setLive] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [unmatched, setUnmatched] = useState<SleeperPick[]>([]);
  const [syncing, setSyncing] = useState(false);

  const processedPickNos = useRef<Set<number>>(new Set());
  const playersRef = useRef(players);
  useEffect(() => {
    playersRef.current = players;
  }, [players]);

  const selectedDraft = drafts.find((d) => d.draft_id === selectedDraftId) ?? null;

  async function handleConnect() {
    const id = leagueId.trim();
    if (!id) return;
    setStatus('connecting');
    setError(null);
    try {
      const [draftList, userList] = await Promise.all([getLeagueDrafts(id), getLeagueUsers(id)]);
      if (draftList.length === 0) {
        setError('No drafts found for that league ID.');
        setStatus('idle');
        return;
      }
      setDrafts(draftList);
      setSelectedDraftId(draftList[0].draft_id);
      setUsers(userList);
      setStatus('connected');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to connect to Sleeper.');
      setStatus('idle');
    }
  }

  function processPick(pick: SleeperPick) {
    if (processedPickNos.current.has(pick.pick_no)) return;
    processedPickNos.current.add(pick.pick_no);

    const name = sleeperPickName(pick);
    const position = pick.metadata?.position;
    const match = findPlayerMatch(name, position, playersRef.current);
    const amount = sleeperPickAmount(pick) ?? 0;
    const isMine = myUserId !== '' && pick.picked_by === myUserId;

    if (!match) {
      setUnmatched((prev) => [...prev, pick]);
      setLog((prev) => [
        { pickNo: pick.pick_no, text: `Couldn't match "${name}" - resolve it below.`, kind: 'unmatched' },
        ...prev,
      ]);
      return;
    }

    if (isMine) {
      onDraftedByMe(match.id, amount);
      setLog((prev) => [
        { pickNo: pick.pick_no, text: `You drafted ${match.name} for $${amount}.`, kind: 'me' },
        ...prev,
      ]);
    } else {
      onDraftedByOpponent(match.id);
      setLog((prev) => [{ pickNo: pick.pick_no, text: `${match.name} drafted by an opponent.`, kind: 'opponent' }, ...prev]);
    }
  }

  async function syncOnce() {
    if (!selectedDraftId) return;
    setSyncing(true);
    try {
      const picks = await getDraftPicks(selectedDraftId);
      for (const pick of picks) {
        if (pick.player_id) {
          processPick(pick);
        }
      }
      setLastSyncedAt(new Date());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch picks from Sleeper.');
    } finally {
      setSyncing(false);
    }
  }

  useEffect(() => {
    if (!live) return;
    syncOnce();
    const interval = setInterval(syncOnce, POLL_MS);
    return () => clearInterval(interval);
    // Deliberately omits syncOnce/processPick from deps - they close over state
    // that changes every poll, and re-running the effect for that would just
    // restart the same interval. Re-arms only when what's being synced changes.
  }, [live, selectedDraftId, myUserId]);

  function resolveUnmatched(pick: SleeperPick, playerId: string) {
    const player = players.find((p) => p.id === playerId);
    if (!player) return;
    const amount = sleeperPickAmount(pick) ?? 0;
    const isMine = myUserId !== '' && pick.picked_by === myUserId;
    if (isMine) {
      onDraftedByMe(player.id, amount);
      setLog((prev) => [{ pickNo: pick.pick_no, text: `You drafted ${player.name} for $${amount}.`, kind: 'me' }, ...prev]);
    } else {
      onDraftedByOpponent(player.id);
      setLog((prev) => [{ pickNo: pick.pick_no, text: `${player.name} drafted by an opponent.`, kind: 'opponent' }, ...prev]);
    }
    setUnmatched((prev) => prev.filter((p) => p.pick_no !== pick.pick_no));
  }

  function ignoreUnmatched(pick: SleeperPick) {
    setUnmatched((prev) => prev.filter((p) => p.pick_no !== pick.pick_no));
  }

  function disconnect() {
    setLive(false);
    setStatus('idle');
    setDrafts([]);
    setUsers([]);
    setMyUserId('');
    setLog([]);
    setUnmatched([]);
    processedPickNos.current = new Set();
  }

  return (
    <div className="panel">
      <h2>Sync with a live Sleeper draft</h2>
      <p className="muted">
        Paste your league's ID to pull picks directly from Sleeper as they happen - your picks and prices are
        applied automatically, and other teams' picks are excluded. Works best for auction drafts.
      </p>

      {status === 'idle' && (
        <div className="sleeper-connect-row">
          <input
            type="text"
            placeholder="Sleeper league ID"
            value={leagueId}
            onChange={(e) => setLeagueId(e.target.value)}
          />
          <button type="button" className="btn-primary" onClick={handleConnect} disabled={!leagueId.trim()}>
            Connect
          </button>
        </div>
      )}

      {status === 'connecting' && <p className="muted">Connecting…</p>}

      {status === 'connected' && (
        <div className="sleeper-connected">
          {drafts.length > 1 && (
            <label className="sleeper-field">
              <span>Draft</span>
              <select value={selectedDraftId} onChange={(e) => setSelectedDraftId(e.target.value)}>
                {drafts.map((d) => (
                  <option key={d.draft_id} value={d.draft_id}>
                    {d.season} - {d.type} ({d.status})
                  </option>
                ))}
              </select>
            </label>
          )}

          {selectedDraft && selectedDraft.type !== 'auction' && (
            <p className="error-text">
              This draft is type "{selectedDraft.type}", not auction - prices synced from it won't reflect real
              bids.
            </p>
          )}

          <label className="sleeper-field">
            <span>Which team is yours?</span>
            <select value={myUserId} onChange={(e) => setMyUserId(e.target.value)}>
              <option value="">— select your team —</option>
              {users.map((u) => (
                <option key={u.user_id} value={u.user_id}>
                  {sleeperUserLabel(u)}
                </option>
              ))}
            </select>
          </label>

          <div className="sleeper-controls">
            <button
              type="button"
              className={live ? 'btn-secondary' : 'btn-primary'}
              onClick={() => setLive((v) => !v)}
              disabled={!myUserId}
            >
              {live ? 'Stop live sync' : 'Start live sync'}
            </button>
            <button type="button" className="btn-secondary" onClick={syncOnce} disabled={!myUserId || syncing}>
              {syncing ? 'Syncing…' : 'Sync once'}
            </button>
            <button type="button" className="btn-secondary" onClick={disconnect}>
              Disconnect
            </button>
            {lastSyncedAt && (
              <span className="muted sleeper-last-synced">Last synced {lastSyncedAt.toLocaleTimeString()}</span>
            )}
          </div>
          {!myUserId && <p className="muted">Pick your team above to start syncing.</p>}
        </div>
      )}

      {error && <p className="error-text">{error}</p>}

      {unmatched.length > 0 && (
        <div className="sleeper-unmatched">
          <h3>Needs a manual match</h3>
          {unmatched.map((pick) => (
            <div key={pick.pick_no} className="sleeper-unmatched-row">
              <span>
                {sleeperPickName(pick)} ({pick.metadata?.position ?? '?'}) - ${sleeperPickAmount(pick) ?? '?'}
              </span>
              <select defaultValue="" onChange={(e) => e.target.value && resolveUnmatched(pick, e.target.value)}>
                <option value="">Match to…</option>
                {players.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.position})
                  </option>
                ))}
              </select>
              <button type="button" className="btn-secondary" onClick={() => ignoreUnmatched(pick)}>
                Ignore
              </button>
            </div>
          ))}
        </div>
      )}

      {log.length > 0 && (
        <ul className="sleeper-log">
          {log.slice(0, 20).map((entry, i) => (
            <li key={`${entry.pickNo}-${i}`} className={`sleeper-log-${entry.kind}`}>
              {entry.text}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
