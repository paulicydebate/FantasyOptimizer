import type { OptimizeResult, RosterConfig } from '../types';

interface Props {
  result: OptimizeResult;
  config: RosterConfig;
  draftedIds?: Set<string>;
}

export function ResultsView({ result, config, draftedIds = new Set() }: Props) {
  if (result.status === 'infeasible' || result.status === 'error') {
    return (
      <div className="panel">
        <h2>Optimal roster</h2>
        <p className="error-text">{result.message}</p>
      </div>
    );
  }

  const remaining = config.budget - result.totalCost;
  const sorted = [...result.assignments].sort((a, b) => a.slot.label.localeCompare(b.slot.label));

  return (
    <div className="panel">
      <h2>Optimal roster</h2>
      {draftedIds.size > 0 && (
        <p className="muted">
          "Drafted" rows are already on your team at the price you paid; the rest are the best picks for your
          remaining budget and open slots.
        </p>
      )}
      <div className="results-summary">
        <div className="stat">
          <span className="stat-value">{result.totalPoints.toFixed(1)}</span>
          <span className="stat-label">Projected points</span>
        </div>
        <div className="stat">
          <span className="stat-value">${result.totalCost.toLocaleString()}</span>
          <span className="stat-label">Total cost</span>
        </div>
        <div className="stat">
          <span className="stat-value">${remaining.toLocaleString()}</span>
          <span className="stat-label">Budget remaining</span>
        </div>
      </div>

      <div className="table-scroll">
        <table className="player-table">
          <thead>
            <tr>
              <th>Slot</th>
              <th>Player</th>
              <th>Position</th>
              <th>Team</th>
              <th className="num">Cost</th>
              <th className="num">Proj. Points</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(({ slot, player }) => (
              <tr key={slot.id}>
                <td>{slot.label || slot.eligiblePositions.join('/')}</td>
                <td>
                  {player.name}
                  {draftedIds.has(player.id) && <span className="drafted-tag">Drafted</span>}
                </td>
                <td>{player.position}</td>
                <td>{player.team ?? ''}</td>
                <td className="num">{player.cost}</td>
                <td className="num">{player.points}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
