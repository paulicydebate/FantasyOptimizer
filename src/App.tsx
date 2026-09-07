import { useMemo, useState } from 'react';
import { FileUpload } from './components/FileUpload';
import { ColumnMapper } from './components/ColumnMapper';
import type { MappingState } from './components/ColumnMapper';
import { RosterConfigForm } from './components/RosterConfigForm';
import { CostControls } from './components/CostControls';
import { SleeperSync } from './components/SleeperSync';
import { PlayerTable } from './components/PlayerTable';
import { ResultsView } from './components/ResultsView';
import { SensitivityView } from './components/SensitivityView';
import { guessMapping } from './lib/csv';
import type { ParsedCsv } from './lib/csv';
import { makeId } from './lib/id';
import { optimizeRoster } from './lib/optimizer';
import { buildRosterSlots, totalRosterSpots } from './lib/roster';
import { runPriceVarianceSimulation, SIMULATION_RUNS } from './lib/simulation';
import type { OptimizeResult, Player, RosterConfig, SimulationSummary } from './types';
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

const DEFAULT_CONFIG: RosterConfig = {
  positionCounts: {},
  budget: 200,
  minCost: null,
  maxCost: null,
  costVariancePct: 0,
  maxPerPosition: {},
};

export default function App() {
  const [stage, setStage] = useState<Stage>('upload');
  const [csv, setCsv] = useState<ParsedCsv | null>(null);
  const [mapping, setMapping] = useState<MappingState>({ name: '', position: '', cost: '', points: '', team: '' });
  const [mappingError, setMappingError] = useState<string | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [requiredIds, setRequiredIds] = useState<Set<string>>(new Set());
  const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set());
  const [pricePaid, setPricePaidMap] = useState<Record<string, number>>({});
  const [config, setConfig] = useState<RosterConfig>(DEFAULT_CONFIG);
  const [result, setResult] = useState<OptimizeResult | null>(null);
  const [optimizing, setOptimizing] = useState(false);
  const [simulation, setSimulation] = useState<SimulationSummary | null>(null);
  const [simulationProgress, setSimulationProgress] = useState(0);

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
    setPricePaidMap({});
    setConfig((prev) => ({ ...prev, positionCounts: {}, minCost: null, maxCost: null, maxPerPosition: {} }));
    setResult(null);
    setSimulation(null);
    setStage('build');
  }

  function clearPricePaid(id: string) {
    setPricePaidMap((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  function toggleRequired(id: string) {
    setRequiredIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        clearPricePaid(id);
      } else {
        next.add(id);
      }
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
    clearPricePaid(id);
  }

  /** Idempotent version of exclude, safe to call repeatedly (e.g. from a poll loop). */
  function markDraftedByOpponent(id: string) {
    setExcludedIds((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
    setRequiredIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    clearPricePaid(id);
  }

  function setPlayerPricePaid(id: string, price: number | null) {
    if (price == null || Number.isNaN(price)) {
      clearPricePaid(id);
      return;
    }
    setPricePaidMap((prev) => ({ ...prev, [id]: Math.max(0, price) }));
    // Entering a real price means you actually drafted them - lock them into the roster.
    setRequiredIds((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
  }

  function resetSelections() {
    setRequiredIds(new Set());
    setExcludedIds(new Set());
    setPricePaidMap({});
  }

  function playersWithActualCosts(): Player[] {
    return players.map((p) => (p.id in pricePaid ? { ...p, cost: pricePaid[p.id] } : p));
  }

  function eligiblePlayers(): Player[] {
    return playersWithActualCosts().filter((p) => {
      if (excludedIds.has(p.id)) return false;
      if (requiredIds.has(p.id)) return true;
      if (config.minCost != null && p.cost < config.minCost) return false;
      if (config.maxCost != null && p.cost > config.maxCost) return false;
      return true;
    });
  }

  async function handleOptimize() {
    setOptimizing(true);
    setResult(null);
    setSimulation(null);
    setSimulationProgress(0);
    try {
      const slots = buildRosterSlots(config, availablePositions);
      const eligible = eligiblePlayers();
      const res = await optimizeRoster(eligible, slots, config.budget, requiredIds, config.maxPerPosition);
      setResult(res);

      if (res.status === 'optimal' && config.costVariancePct > 0) {
        const summary = await runPriceVarianceSimulation(
          eligible,
          slots,
          config.budget,
          requiredIds,
          config.costVariancePct,
          config.maxPerPosition,
          new Set(Object.keys(pricePaid)),
          SIMULATION_RUNS,
          setSimulationProgress,
        );
        setSimulation(summary);
      }
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
          highest-scoring roster you can afford. During a live auction, mark players you've drafted (and what you
          paid) or that someone else took, and re-generate to see the best roster with real prices and availability.
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

          <SleeperSync players={players} onDraftedByMe={setPlayerPricePaid} onDraftedByOpponent={markDraftedByOpponent} />

          <RosterConfigForm config={config} onChange={setConfig} availablePositions={availablePositions} />

          <CostControls config={config} onChange={setConfig} />

          <PlayerTable
            players={players}
            requiredIds={requiredIds}
            excludedIds={excludedIds}
            pricePaid={pricePaid}
            onToggleRequired={toggleRequired}
            onToggleExcluded={toggleExcluded}
            onSetPricePaid={setPlayerPricePaid}
            onResetSelections={resetSelections}
          />

          <div className="panel optimize-panel">
            <button className="btn-primary btn-large" onClick={handleOptimize} disabled={optimizing || totalSpots === 0}>
              {optimizing
                ? simulationProgress > 0
                  ? `Running simulation… (${simulationProgress}/${SIMULATION_RUNS})`
                  : 'Optimizing…'
                : 'Generate optimal roster'}
            </button>
            {totalSpots === 0 && <p className="muted">Set at least one position count above to get started.</p>}
          </div>

          {result && (
            <ResultsView result={result} config={config} draftedIds={new Set(Object.keys(pricePaid))} />
          )}

          {simulation && <SensitivityView summary={simulation} variancePct={config.costVariancePct} />}
        </>
      )}
    </div>
  );
}
