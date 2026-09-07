import type { ParsedCsv } from '../lib/csv';

export interface MappingState {
  name: string;
  position: string;
  cost: string;
  points: string;
  team: string;
}

interface Props {
  csv: ParsedCsv;
  mapping: MappingState;
  onChange: (mapping: MappingState) => void;
  onConfirm: () => void;
  error: string | null;
}

const FIELDS: { key: keyof MappingState; label: string; required: boolean }[] = [
  { key: 'name', label: 'Player name', required: true },
  { key: 'position', label: 'Position', required: true },
  { key: 'cost', label: 'Auction cost', required: true },
  { key: 'points', label: 'Projected points', required: true },
  { key: 'team', label: 'Team (optional)', required: false },
];

export function ColumnMapper({ csv, mapping, onChange, onConfirm, error }: Props) {
  const previewRows = csv.rows.slice(0, 3);

  return (
    <div className="panel">
      <h2>Map your columns</h2>
      <p className="muted">Tell us which column in your spreadsheet holds each field.</p>
      <div className="mapper-grid">
        {FIELDS.map((field) => (
          <label key={field.key} className="mapper-field">
            <span>
              {field.label}
              {field.required && <span className="required-mark">*</span>}
            </span>
            <select
              value={mapping[field.key]}
              onChange={(e) => onChange({ ...mapping, [field.key]: e.target.value })}
            >
              <option value="">{field.required ? '— select —' : '— none —'}</option>
              {csv.headers.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>

      <div className="table-scroll">
        <table className="preview-table">
          <thead>
            <tr>
              {csv.headers.map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {previewRows.map((row, i) => (
              <tr key={i}>
                {csv.headers.map((h) => (
                  <td key={h}>{row[h]}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {error && <p className="error-text">{error}</p>}

      <button className="btn-primary" onClick={onConfirm}>
        Continue
      </button>
    </div>
  );
}
