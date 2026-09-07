import { useMemo, useState } from 'react';
import type { Player } from '../types';

interface Props {
  players: Player[];
  requiredIds: Set<string>;
  excludedIds: Set<string>;
  onToggleRequired: (id: string) => void;
  onToggleExcluded: (id: string) => void;
}

export function PlayerTable({ players, requiredIds, excludedIds, onToggleRequired, onToggleExcluded }: Props) {
  const [search, setSearch] = useState('');
  const [positionFilter, setPositionFilter] = useState('');

  const positions = useMemo(
    () => [...new Set(players.map((p) => p.position))].sort(),
    [players],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return players.filter((p) => {
      if (positionFilter && p.position !== positionFilter) return false;
      if (q && !p.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [players, search, positionFilter]);

  const requiredCount = requiredIds.size;
  const requiredCost = players
    .filter((p) => requiredIds.has(p.id))
    .reduce((sum, p) => sum + p.cost, 0);
  const excludedCount = excludedIds.size;

  return (
    <div className="panel">
      <h2>Players ({players.length})</h2>
      <p className="muted">
        Check "Require" to guarantee a player a roster spot, or "Exclude" to keep them out entirely.
        {requiredCount > 0 && (
          <strong>
            {' '}
            {requiredCount} required, ${requiredCost.toLocaleString()} committed.
          </strong>
        )}
        {excludedCount > 0 && <strong> {excludedCount} excluded.</strong>}
      </p>

      <div className="player-filters">
        <input
          type="text"
          placeholder="Search players…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select value={positionFilter} onChange={(e) => setPositionFilter(e.target.value)}>
          <option value="">All positions</option>
          {positions.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </div>

      <div className="table-scroll table-scroll-tall">
        <table className="player-table">
          <thead>
            <tr>
              <th>Require</th>
              <th>Exclude</th>
              <th>Name</th>
              <th>Position</th>
              <th>Team</th>
              <th className="num">Cost</th>
              <th className="num">Proj. Points</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => {
              const isRequired = requiredIds.has(p.id);
              const isExcluded = excludedIds.has(p.id);
              return (
                <tr key={p.id} className={isRequired ? 'row-required' : isExcluded ? 'row-excluded' : ''}>
                  <td>
                    <input type="checkbox" checked={isRequired} onChange={() => onToggleRequired(p.id)} />
                  </td>
                  <td>
                    <input type="checkbox" checked={isExcluded} onChange={() => onToggleExcluded(p.id)} />
                  </td>
                  <td>{p.name}</td>
                  <td>{p.position}</td>
                  <td>{p.team ?? ''}</td>
                  <td className="num">{p.cost}</td>
                  <td className="num">{p.points}</td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="muted">
                  No players match your filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
