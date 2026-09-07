import type { SimulationSummary } from '../types';

interface Props {
  summary: SimulationSummary;
  variancePct: number;
}

export function SensitivityView({ summary, variancePct }: Props) {
  const { successfulRuns, requestedRuns, stats } = summary;

  const grouped = new Map<string, typeof stats>();
  for (const stat of stats) {
    const list = grouped.get(stat.player.position) ?? [];
    list.push(stat);
    grouped.set(stat.player.position, list);
  }

  return (
    <div className="panel">
      <h2>Price sensitivity</h2>
      <p className="muted">
        Re-solved the roster {requestedRuns} times with every player's cost randomly jittered by ±{variancePct}%
        to see who's a good pick even if auction prices don't land exactly where the sheet predicts.
        {successfulRuns < requestedRuns && (
          <strong>
            {' '}
            Only {successfulRuns} of {requestedRuns} runs found a feasible roster under that much variance — the
            rest ran out of budget or couldn't fit a required player.
          </strong>
        )}
      </p>

      {successfulRuns === 0 ? (
        <p className="error-text">No simulation run found a feasible roster. Try a lower variance or a higher budget.</p>
      ) : (
        <div className="sensitivity-groups">
          {[...grouped.entries()].map(([position, positionStats]) => (
            <div key={position} className="sensitivity-group">
              <h3>{position}</h3>
              <table className="player-table">
                <thead>
                  <tr>
                    <th>Player</th>
                    <th className="num">Listed cost</th>
                    <th className="num">Included in</th>
                  </tr>
                </thead>
                <tbody>
                  {positionStats.map(({ player, rate }) => (
                    <tr key={player.id}>
                      <td>{player.name}</td>
                      <td className="num">{player.cost}</td>
                      <td className="num">
                        <span className="rate-bar-track">
                          <span className="rate-bar-fill" style={{ width: `${Math.round(rate * 100)}%` }} />
                        </span>
                        {Math.round(rate * 100)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
