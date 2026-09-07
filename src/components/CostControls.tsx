import type { RosterConfig } from '../types';

interface Props {
  config: RosterConfig;
  onChange: (config: RosterConfig) => void;
}

function parseOptionalNumber(value: string): number | null {
  if (value.trim() === '') return null;
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}

export function CostControls({ config, onChange }: Props) {
  return (
    <div className="panel">
      <h2>Cost filters &amp; price variance</h2>
      <p className="muted">
        Auction prices rarely land exactly on a projection sheet's numbers. Use these to keep the optimizer from
        leaning on unrealistic bargains, or to see which picks hold up if prices move.
      </p>

      <div className="cost-controls-grid">
        <label className="cost-control-field">
          <span>Minimum player cost</span>
          <input
            type="number"
            min={0}
            placeholder="No minimum"
            value={config.minCost ?? ''}
            onChange={(e) => onChange({ ...config, minCost: parseOptionalNumber(e.target.value) })}
          />
          <span className="field-hint">Ignore players cheaper than this (required players are never excluded).</span>
        </label>

        <label className="cost-control-field">
          <span>Maximum player cost</span>
          <input
            type="number"
            min={0}
            placeholder="No maximum"
            value={config.maxCost ?? ''}
            onChange={(e) => onChange({ ...config, maxCost: parseOptionalNumber(e.target.value) })}
          />
          <span className="field-hint">Ignore players pricier than this.</span>
        </label>

        <label className="cost-control-field">
          <span>Price variance (±%)</span>
          <input
            type="number"
            min={0}
            max={100}
            placeholder="0"
            value={config.costVariancePct || ''}
            onChange={(e) => onChange({ ...config, costVariancePct: Math.max(0, Number(e.target.value) || 0) })}
          />
          <span className="field-hint">
            Re-solves the roster many times with costs randomly jittered by this much, and shows how often each
            player still makes the cut.
          </span>
        </label>
      </div>
    </div>
  );
}
