import { useMemo, useState } from 'react';
import { FileUpload } from './components/FileUpload';
import { ColumnMapper } from './components/ColumnMapper';
import type { MappingState } from './components/ColumnMapper';
import { RosterConfigForm } from './components/RosterConfigForm';
import { PlayerTable } from './components/PlayerTable';
import { ResultsView } from './components/ResultsView';
import { guessMapping } from './lib/csv';
import type { ParsedCsv } from './lib/csv';
import { makeId } from './lib/id';
import { optimizeRoster } from './lib/optimizer';
import { buildRosterSlots, totalRosterSpots } from './lib/roster';
import type { OptimizeResult, Player, RosterConfig } from './types';
import './app.css';

type Stage = 'upload' | 'mapping' | 'build';

function buildPlayers(csv: ParsedCsv, mapping: MappingState): { players: Player[]; error: string | null } {
  const players: Player[] = [];
  for (const row of csv.rows) {
    const name = row[mapping.name]?.trim();
    const position = row[mapping.position]?.trim();
    const costRaw = row[mapping.cost];
    const pointsRaw = row[mapping.points];
    if (!name || !position) continue;

    const cost = Number(String(costRaw).replace(/[^0-9.-]/g, ''));
    const points = Number(String(pointsRaw).replace(/[^0-9.-]/g, ''));
    if (Number.isNaN(cost) || Number.isNaN(points)) continue;

    players.push({
      id: makeId(),
      name,
      position,
      cost,
      points,
      team: mapping.team ? row[mapping.team]?.trim() : undefined,
    });
  }

  if (players.length === 0) {
    return { players: [], error: 'No valid player rows found. Check that your column mapping and data types are correct.' };
  }
  return { players, error: null };
}

export default function App() {
  const [stage, setStage] = useState<Stage>('upload');
  const [csv, setCsv] = useState<ParsedCsv | null>(null);
  const [mapping, setMapping] = useState<MappingState>({ name: '', position: '', cost: '', points: '', team: '' });
  const [mappingError, setMappingError] = useState<string | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [requiredIds, setRequiredIds] = useState<Set<string>>(new Set());
  const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set());
  const [config, setConfig] = useState<RosterConfig>({ positionCounts: {}, budget: 200 });
  const [result, setResult] = useState<OptimizeResult | null>(null);
  const [optimizing, setOptimizing] = useState(false);

  const availablePositions = useMemo(
    () => [...new Set(players.map((p) => p.position))].sort(),
    [players],
  );

  function handleParsed(data: ParsedCsv) {
    setCsv(data);
    setMapping({ ...guessMapping(data.headers), team: guessMapping(data.headers).team ?? '' });
    setStage('mapping');
  }

  function handleConfirmMapping() {
    if (!csv) return;
    if (!mapping.name || !mapping.position || !mapping.cost || !mapping.points) {
      setMappingError('Please map all required fields.');
      return;
    }
    const { players: built, error } = buildPlayers(csv, mapping);
    if (error) {
      setMappingError(error);
      return;
    }
    setMappingError(null);
    setPlayers(built);
    setRequiredIds(new Set());
    setExcludedIds(new Set());
    setConfig((prev) => ({ ...prev, positionCounts: {} }));
    setResult(null);
    setStage('build');
  }

  function toggleRequired(id: string) {
    setRequiredIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setExcludedIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  function toggleExcluded(id: string) {
    setExcludedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setRequiredIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  async function handleOptimize() {
    setOptimizing(true);
    setResult(null);
    try {
      const slots = buildRosterSlots(config, availablePositions);
      const eligiblePlayers = players.filter((p) => !excludedIds.has(p.id));
      const res = await optimizeRoster(eligiblePlayers, slots, config.budget, requiredIds);
      setResult(res);
    } catch (e) {
      setResult({
        status: 'error',
        message: e instanceof Error ? e.message : 'Something went wrong while optimizing.',
        assignments: [],
        totalCost: 0,
        totalPoints: 0,
      });
    } finally {
      setOptimizing(false);
    }
  }

  const totalSpots = totalRosterSpots(config);

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>Fantasy Roster Optimizer</h1>
        <p className="muted">
          Upload your player pool, set your budget and roster rules, lock in any must-have players, and find the
          highest-scoring roster you can afford.
        </p>
      </header>

      {stage === 'upload' && <FileUpload onParsed={handleParsed} />}

      {stage === 'mapping' && csv && (
        <ColumnMapper
          csv={csv}
          mapping={mapping}
          onChange={setMapping}
          onConfirm={handleConfirmMapping}
          error={mappingError}
        />
      )}

      {stage === 'build' && (
        <>
          <div className="toolbar">
            <button className="btn-secondary" onClick={() => setStage('upload')}>
              ← Upload a different file
            </button>
          </div>

          <RosterConfigForm config={config} onChange={setConfig} availablePositions={availablePositions} />

          <PlayerTable
            players={players}
            requiredIds={requiredIds}
            excludedIds={excludedIds}
            onToggleRequired={toggleRequired}
            onToggleExcluded={toggleExcluded}
          />

          <div className="panel optimize-panel">
            <button className="btn-primary btn-large" onClick={handleOptimize} disabled={optimizing || totalSpots === 0}>
              {optimizing ? 'Optimizing…' : 'Generate optimal roster'}
            </button>
            {totalSpots === 0 && <p className="muted">Set at least one position count above to get started.</p>}
          </div>

          {result && <ResultsView result={result} config={config} />}
        </>
      )}
    </div>
  );
}
