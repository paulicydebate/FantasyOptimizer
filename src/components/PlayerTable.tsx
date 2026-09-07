import { useMemo, useState } from 'react';
import type { Player } from '../types';

interface Props {
  players: Player[];
  requiredIds: Set<string>;
  excludedIds: Set<string>;
  pricePaid: Record<string, number>;
  onToggleRequired: (id: string) => void;
  onToggleExcluded: (id: string) => void;
  onSetPricePaid: (id: string, price: number | null) => void;
  onResetSelections: () => void;
}

export function PlayerTable({
  players,
  requiredIds,
  excludedIds,
  pricePaid,
  onToggleRequired,
  onToggleExcluded,
  onSetPricePaid,
  onResetSelections,
}: Props) {
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
  const draftedCount = Object.keys(pricePaid).length;
  const requiredCost = players
    .filter((p) => requiredIds.has(p.id))
    .reduce((sum, p) => sum + (pricePaid[p.id] ?? p.cost), 0);
  const excludedCount = excludedIds.size;

  return (
    <div className="panel">
      <div className="player-table-header-row">
        <h2>Players ({players.length})</h2>
        {(requiredCount > 0 || excludedCount > 0) && (
          <button type="button" className="btn-secondary" onClick={onResetSelections}>
            Reset draft board
          </button>
        )}
      </div>
      <p className="muted">
        Check "Require" (and optionally enter the price you paid) once you've drafted a player yourself, or to
        flag a must-have target. Check "Exclude" once a player is drafted by someone else, or to rule them out.
        {requiredCount > 0 && (
          <strong>
            {' '}
            {requiredCount} required{draftedCount > 0 ? ` (${draftedCount} drafted)` : ''}, ${requiredCost.toLocaleString()}{' '}
            committed.
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
              <th>Price paid</th>
              <th>Exclude</th>
              <th>Name</th>
              <th>Position</th>
              <th>Team</th>
              <th className="num">Listed cost</th>
              <th className="num">Proj. Points</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => {
              const isRequired = requiredIds.has(p.id);
              const isExcluded = excludedIds.has(p.id);
              const paid = pricePaid[p.id];
              return (
                <tr key={p.id} className={isRequired ? 'row-required' : isExcluded ? 'row-excluded' : ''}>
                  <td>
                    <input type="checkbox" checked={isRequired} onChange={() => onToggleRequired(p.id)} />
                  </td>
                  <td>
                    <input
                      type="number"
                      min={0}
                      className="price-paid-input"
                      placeholder="listed"
                      disabled={isExcluded}
                      value={paid ?? ''}
                      onChange={(e) => {
                        const raw = e.target.value;
                        onSetPricePaid(p.id, raw === '' ? null : Number(raw));
                      }}
                    />
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
                <td colSpan={8} className="muted">
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
