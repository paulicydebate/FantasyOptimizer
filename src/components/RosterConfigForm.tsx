import { FLEX_KEY, flexPositions, totalRosterSpots } from '../lib/roster';
import type { RosterConfig } from '../types';

interface Props {
  config: RosterConfig;
  onChange: (config: RosterConfig) => void;
  availablePositions: string[];
}

export function RosterConfigForm({ config, onChange, availablePositions }: Props) {
  function setCount(key: string, count: number) {
    onChange({
      ...config,
      positionCounts: { ...config.positionCounts, [key]: Math.max(0, count) },
    });
  }

  const flexEligible = flexPositions(availablePositions);
  const rows = [
    ...availablePositions.map((position) => ({ key: position, label: position })),
    ...(flexEligible.length > 0 ? [{ key: FLEX_KEY, label: `FLEX (${flexEligible.join('/')})` }] : []),
  ];

  return (
    <div className="panel">
      <h2>Roster requirements</h2>
      <p className="muted">Set how many roster spots you need at each position.</p>

      <label className="budget-field">
        <span>Total budget</span>
        <input
          type="number"
          min={0}
          value={config.budget}
          onChange={(e) => onChange({ ...config, budget: Number(e.target.value) })}
        />
      </label>

      {rows.length === 0 ? (
        <p className="muted">Upload player data first to see positions.</p>
      ) : (
        <div className="position-count-grid">
          {rows.map((row) => (
            <label key={row.key} className="position-count-row">
              <span>{row.label}</span>
              <input
                type="number"
                min={0}
                value={config.positionCounts[row.key] ?? 0}
                onChange={(e) => setCount(row.key, Number(e.target.value))}
              />
            </label>
          ))}
        </div>
      )}

      <p className="muted total-slots-note">Total roster spots: {totalRosterSpots(config)}</p>
    </div>
  );
}
