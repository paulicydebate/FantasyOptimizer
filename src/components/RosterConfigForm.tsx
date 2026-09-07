import { makeId } from '../lib/id';
import type { RosterConfig, RosterSlot } from '../types';

interface Props {
  config: RosterConfig;
  onChange: (config: RosterConfig) => void;
  availablePositions: string[];
}

export function RosterConfigForm({ config, onChange, availablePositions }: Props) {
  function updateSlot(id: string, patch: Partial<RosterSlot>) {
    onChange({
      ...config,
      slots: config.slots.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    });
  }

  function addSlot() {
    const slot: RosterSlot = {
      id: makeId(),
      label: '',
      eligiblePositions: [],
      count: 1,
    };
    onChange({ ...config, slots: [...config.slots, slot] });
  }

  function removeSlot(id: string) {
    onChange({ ...config, slots: config.slots.filter((s) => s.id !== id) });
  }

  function togglePosition(slot: RosterSlot, pos: string) {
    const has = slot.eligiblePositions.includes(pos);
    const eligiblePositions = has
      ? slot.eligiblePositions.filter((p) => p !== pos)
      : [...slot.eligiblePositions, pos];
    updateSlot(slot.id, { eligiblePositions });
  }

  const totalSlotCount = config.slots.reduce((sum, s) => sum + (s.count || 0), 0);

  return (
    <div className="panel">
      <h2>Roster requirements</h2>
      <p className="muted">
        Define each roster slot and which positions can fill it. Add a "FLEX"-style slot by selecting multiple
        positions.
      </p>

      <label className="budget-field">
        <span>Total budget</span>
        <input
          type="number"
          min={0}
          value={config.budget}
          onChange={(e) => onChange({ ...config, budget: Number(e.target.value) })}
        />
      </label>

      <div className="slot-list">
        {config.slots.map((slot) => (
          <div key={slot.id} className="slot-row">
            <input
              className="slot-label-input"
              type="text"
              placeholder="Slot name (e.g. RB, FLEX)"
              value={slot.label}
              onChange={(e) => updateSlot(slot.id, { label: e.target.value })}
            />
            <div className="position-chips">
              {availablePositions.map((pos) => (
                <button
                  key={pos}
                  type="button"
                  className={`chip ${slot.eligiblePositions.includes(pos) ? 'chip-active' : ''}`}
                  onClick={() => togglePosition(slot, pos)}
                >
                  {pos}
                </button>
              ))}
              {availablePositions.length === 0 && (
                <span className="muted">Upload player data first to see positions.</span>
              )}
            </div>
            <label className="slot-count">
              <span>Count</span>
              <input
                type="number"
                min={1}
                value={slot.count}
                onChange={(e) => updateSlot(slot.id, { count: Math.max(1, Number(e.target.value)) })}
              />
            </label>
            <button type="button" className="btn-icon-danger" onClick={() => removeSlot(slot.id)} aria-label="Remove slot">
              ✕
            </button>
          </div>
        ))}
      </div>

      <button type="button" className="btn-secondary" onClick={addSlot}>
        + Add slot
      </button>

      <p className="muted total-slots-note">Total roster spots: {totalSlotCount}</p>
    </div>
  );
}
