import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeftRight,
  ArrowRight,
  BookmarkPlus,
  CheckCircle2,
  ShieldAlert,
  SlidersHorizontal,
} from 'lucide-react';
import type {
  ProjectParameters,
  ProjectRecord,
  RiskTier,
  SavedScenario,
} from '../types/project';
import { predictProjectRisk } from '../utils/riskEngine';

interface ScenarioComparisonViewProps {
  savedScenarios: SavedScenario[];
  records: ProjectRecord[];
  onSaveCurrentToScenarios: (customName?: string) => void;
  onLoadSamplePair: () => void;
  onLoadScenarioToWorkbench: (scenario: SavedScenario) => void;
}

interface ParameterRowMeta {
  key: keyof ProjectParameters;
  label: string;
  format: (p: ProjectParameters) => string;
  diffLabel: (a: ProjectParameters, b: ProjectParameters) => string | null;
}

const PARAMETER_ROWS: ParameterRowMeta[] = [
  {
    key: 'project_type',
    label: 'Project Type',
    format: (p) => p.project_type,
    diffLabel: (a, b) =>
      a.project_type === b.project_type
        ? null
        : `${a.project_type} -> ${b.project_type}`,
  },
  {
    key: 'region',
    label: 'State Jurisdiction',
    format: (p) => p.region,
    diffLabel: (a, b) =>
      a.region === b.region ? null : `${a.region} -> ${b.region}`,
  },
  {
    key: 'environmental_clearance_status',
    label: 'Environmental Clearance',
    format: (p) => p.environmental_clearance_status,
    diffLabel: (a, b) =>
      a.environmental_clearance_status === b.environmental_clearance_status
        ? null
        : `${a.environmental_clearance_status} -> ${b.environmental_clearance_status}`,
  },
  {
    key: 'litigations_count',
    label: 'Active Litigations',
    format: (p) =>
      `${p.litigations_count} ${p.litigations_count === 1 ? 'case' : 'cases'}`,
    diffLabel: (a, b) => {
      const d = b.litigations_count - a.litigations_count;
      if (d === 0) return null;
      return `${d > 0 ? '+' : ''}${d} ${Math.abs(d) === 1 ? 'case' : 'cases'}`;
    },
  },
  {
    key: 'compensation_disputed_flag',
    label: 'Compensation Disputed',
    format: (p) => (p.compensation_disputed_flag === 1 ? 'Yes' : 'No'),
    diffLabel: (a, b) =>
      a.compensation_disputed_flag === b.compensation_disputed_flag
        ? null
        : b.compensation_disputed_flag === 1
          ? 'Dispute Raised'
          : 'Dispute Resolved',
  },
  {
    key: 'public_hearing_completed',
    label: 'Public Hearing',
    format: (p) => (p.public_hearing_completed === 1 ? 'Completed' : 'Pending'),
    diffLabel: (a, b) =>
      a.public_hearing_completed === b.public_hearing_completed
        ? null
        : b.public_hearing_completed === 1
          ? 'Completed'
          : 'Reverted to Pending',
  },
  {
    key: 'rehabilitation_progress_pct',
    label: 'Rehabilitation Progress',
    format: (p) => `${p.rehabilitation_progress_pct.toFixed(0)}%`,
    diffLabel: (a, b) => {
      const d = Math.round(
        b.rehabilitation_progress_pct - a.rehabilitation_progress_pct
      );
      if (d === 0) return null;
      return `${d > 0 ? '+' : ''}${d}%`;
    },
  },
  {
    key: 'bureaucratic_delay_days',
    label: 'Administrative File Delay',
    format: (p) => `${p.bureaucratic_delay_days} days`,
    diffLabel: (a, b) => {
      const d = b.bureaucratic_delay_days - a.bureaucratic_delay_days;
      if (d === 0) return null;
      return `${d > 0 ? '+' : ''}${d} days`;
    },
  },
  {
    key: 'affected_families_count',
    label: 'Affected Families',
    format: (p) => p.affected_families_count.toLocaleString(),
    diffLabel: (a, b) => {
      const d = b.affected_families_count - a.affected_families_count;
      if (d === 0) return null;
      return `${d > 0 ? '+' : ''}${d.toLocaleString()}`;
    },
  },
  {
    key: 'region_size_hectares',
    label: 'Acquisition Area',
    format: (p) => `${p.region_size_hectares.toFixed(0)} ha`,
    diffLabel: (a, b) => {
      const d = Math.round(b.region_size_hectares - a.region_size_hectares);
      if (d === 0) return null;
      return `${d > 0 ? '+' : ''}${d} ha`;
    },
  },
];

function getTierVisuals(tier: RiskTier) {
  switch (tier) {
    case 'Critical Risk':
      return {
        textClass: 'text-rose-400',
        Icon: ShieldAlert,
      };
    case 'Moderate Watch':
      return {
        textClass: 'text-amber-400',
        Icon: AlertTriangle,
      };
    case 'Low Risk / On Track':
      return {
        textClass: 'text-teal-400',
        Icon: CheckCircle2,
      };
  }
}

export default function ScenarioComparisonView({
  savedScenarios,
  records,
  onSaveCurrentToScenarios,
  onLoadSamplePair,
  onLoadScenarioToWorkbench,
}: ScenarioComparisonViewProps) {
  const [selectedAId, setSelectedAId] = useState<string>(
    () => savedScenarios[0]?.id ?? ''
  );
  const [selectedBId, setSelectedBId] = useState<string>(
    () => savedScenarios[1]?.id ?? savedScenarios[0]?.id ?? ''
  );
  const [showChangedOnly, setShowChangedOnly] = useState(false);

  const scenarioA = useMemo(
    () =>
      savedScenarios.find((s) => s.id === selectedAId) ??
      savedScenarios[0] ??
      null,
    [savedScenarios, selectedAId]
  );

  const scenarioB = useMemo(() => {
    const found = savedScenarios.find((s) => s.id === selectedBId);
    if (found) return found;
    if (savedScenarios.length > 1) {
      return savedScenarios[0].id === scenarioA?.id
        ? savedScenarios[1]
        : savedScenarios[0];
    }
    return savedScenarios[0] ?? null;
  }, [savedScenarios, selectedBId, scenarioA]);

  const predictionA = useMemo(
    () => (scenarioA ? predictProjectRisk(scenarioA.parameters, records) : null),
    [scenarioA, records]
  );

  const predictionB = useMemo(
    () => (scenarioB ? predictProjectRisk(scenarioB.parameters, records) : null),
    [scenarioB, records]
  );

  const shapComparison = useMemo(() => {
    if (!predictionA || !predictionB) return [];
    const mapB = new Map(
      predictionB.shapContributions.map((item) => [item.key, item])
    );

    return predictionA.shapContributions
      .map((itemA) => {
        const itemB = mapB.get(itemA.key)!;
        const delta = Math.round((itemB.impactPct - itemA.impactPct) * 10) / 10;
        return {
          key: itemA.key,
          label: itemA.label,
          impactA: itemA.impactPct,
          impactB: itemB.impactPct,
          valueA: itemA.displayValue,
          valueB: itemB.displayValue,
          delta,
        };
      })
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  }, [predictionA, predictionB]);

  const maxBarScale = useMemo(() => {
    if (shapComparison.length === 0) return 10;
    return Math.max(
      10,
      ...shapComparison.flatMap((row) => [
        Math.abs(row.impactA),
        Math.abs(row.impactB),
      ])
    );
  }, [shapComparison]);

  const paramDiffCount = useMemo(() => {
    if (!scenarioA || !scenarioB) return 0;
    return PARAMETER_ROWS.filter(
      (row) => row.diffLabel(scenarioA.parameters, scenarioB.parameters) !== null
    ).length;
  }, [scenarioA, scenarioB]);

  const visibleRows = useMemo(() => {
    if (!scenarioA || !scenarioB) return [];
    if (!showChangedOnly) return PARAMETER_ROWS;
    return PARAMETER_ROWS.filter(
      (row) => row.diffLabel(scenarioA.parameters, scenarioB.parameters) !== null
    );
  }, [scenarioA, scenarioB, showChangedOnly]);

  if (
    savedScenarios.length < 2 ||
    !scenarioA ||
    !scenarioB ||
    !predictionA ||
    !predictionB
  ) {
    return (
      <section className="bg-[#162032] border border-slate-800 rounded-lg p-8 text-center space-y-4">
        <div className="space-y-1">
          <h2 className="font-display text-base font-semibold text-slate-100">
            Save at least two scenarios to compare side-by-side
          </h2>
          <p className="text-sm text-slate-400 max-w-lg mx-auto">
            Capture scenarios from the Risk Assessment workbench, or load a pair of reference scenarios to inspect parameter differences and risk impact.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2.5">
          <button
            type="button"
            onClick={() => onSaveCurrentToScenarios()}
            className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-md border border-slate-700 bg-slate-800/80 text-xs font-medium text-slate-200 hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <BookmarkPlus className="h-3.5 w-3.5 text-blue-400" />
            <span>Save Current Workbench</span>
          </button>
          <button
            type="button"
            onClick={onLoadSamplePair}
            className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-md bg-blue-600 text-xs font-medium text-white hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <span>Load Reference Pair</span>
          </button>
        </div>
      </section>
    );
  }

  const visualsA = getTierVisuals(predictionA.riskTier);
  const visualsB = getTierVisuals(predictionB.riskTier);
  const probDelta =
    Math.round((predictionB.probabilityPct - predictionA.probabilityPct) * 10) /
    10;

  const minPos = Math.min(predictionA.probabilityPct, predictionB.probabilityPct);
  const spanWidth = Math.abs(
    predictionB.probabilityPct - predictionA.probabilityPct
  );

  const handleSwap = () => {
    const prevA = scenarioA.id;
    const prevB = scenarioB.id;
    setSelectedAId(prevB);
    setSelectedBId(prevA);
  };

  return (
    <div className="space-y-6">
      {/* Side-by-Side Scenario Picker Bar */}
      <section
        aria-label="Select Scenarios to Compare"
        className="bg-[#162032] border border-slate-800 rounded-lg p-4 sm:p-5"
      >
        <div className="grid grid-cols-1 lg:grid-cols-11 gap-3 items-end">
          <div className="lg:col-span-4">
            <label
              htmlFor="compare-scenario-a"
              className="block text-xs font-medium text-slate-400 mb-1"
            >
              Scenario A (Baseline)
            </label>
            <select
              id="compare-scenario-a"
              value={scenarioA.id}
              onChange={(e) => setSelectedAId(e.target.value)}
              className="w-full h-9 rounded-md border border-slate-700 bg-[#0F172A] px-2.5 text-sm font-medium text-slate-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {savedScenarios.map((sc) => (
                <option key={sc.id} value={sc.id}>
                  {sc.name} ({sc.probabilityPct.toFixed(1)}%)
                </option>
              ))}
            </select>
          </div>

          <div className="lg:col-span-1 flex justify-center">
            <button
              type="button"
              onClick={handleSwap}
              title="Swap Scenario A and Scenario B"
              aria-label="Swap Scenario A and Scenario B"
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-700 bg-slate-800/70 text-slate-300 hover:bg-slate-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              <ArrowLeftRight className="h-4 w-4" />
            </button>
          </div>

          <div className="lg:col-span-4">
            <label
              htmlFor="compare-scenario-b"
              className="block text-xs font-medium text-slate-400 mb-1"
            >
              Scenario B (Comparison)
            </label>
            <select
              id="compare-scenario-b"
              value={scenarioB.id}
              onChange={(e) => setSelectedBId(e.target.value)}
              className="w-full h-9 rounded-md border border-slate-700 bg-[#0F172A] px-2.5 text-sm font-medium text-slate-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {savedScenarios.map((sc) => (
                <option key={sc.id} value={sc.id}>
                  {sc.name} ({sc.probabilityPct.toFixed(1)}%)
                </option>
              ))}
            </select>
          </div>

          <div className="lg:col-span-2 flex lg:justify-end">
            <button
              type="button"
              onClick={() => onSaveCurrentToScenarios()}
              className="w-full lg:w-auto inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-md border border-slate-700 bg-slate-800/80 text-xs font-medium text-slate-200 hover:bg-slate-800 hover:text-white whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              <BookmarkPlus className="h-3.5 w-3.5 text-blue-400" />
              <span>Capture Current</span>
            </button>
          </div>
        </div>
      </section>

      {/* Risk Impact Summary Strip */}
      <section
        aria-label="Probability Impact Summary"
        className="bg-[#162032] border border-slate-800 rounded-lg grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-slate-800"
      >
        {/* Scenario A Card */}
        <div className="p-5 flex flex-col justify-between gap-3">
          <div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium uppercase tracking-wider text-slate-400">
                Scenario A
              </span>
              <button
                type="button"
                onClick={() => onLoadScenarioToWorkbench(scenarioA)}
                className="inline-flex items-center gap-1 text-xs font-medium text-blue-400 hover:text-blue-300 whitespace-nowrap shrink-0"
              >
                <SlidersHorizontal className="h-3 w-3" />
                <span>Load A</span>
              </button>
            </div>
            <div className="mt-1 text-sm font-semibold text-slate-100 truncate">
              {scenarioA.name}
            </div>
            <div className="mt-2 font-mono text-3xl font-semibold tabular-nums text-slate-100">
              {predictionA.probabilityPct.toFixed(1)}%
            </div>
          </div>

          <div className="flex items-center gap-1.5 text-xs font-medium">
            <visualsA.Icon
              className={`h-4 w-4 shrink-0 ${visualsA.textClass}`}
              aria-hidden="true"
            />
            <span className={visualsA.textClass}>{predictionA.riskTier}</span>
          </div>
        </div>

        {/* Delta Card */}
        <div className="p-5 bg-slate-900/50 flex flex-col justify-between gap-3">
          <div>
            <div className="text-xs font-medium uppercase tracking-wider text-slate-400">
              Risk Impact (B vs A)
            </div>
            <div
              className={`mt-3 font-mono text-3xl font-semibold tabular-nums ${
                probDelta < -0.1
                  ? 'text-teal-400'
                  : probDelta > 0.1
                    ? 'text-rose-400'
                    : 'text-slate-300'
              }`}
            >
              {probDelta > 0 ? '+' : ''}
              {probDelta.toFixed(1)} pp
            </div>
            <div className="mt-1.5 text-xs text-slate-400">
              {paramDiffCount}{' '}
              {paramDiffCount === 1 ? 'parameter differs' : 'parameters differ'}
            </div>
          </div>

          <div className="text-xs text-slate-300 flex items-center gap-1.5 flex-wrap">
            {predictionA.riskTier === predictionB.riskTier ? (
              <span>Remains in {predictionB.riskTier}</span>
            ) : (
              <>
                <span className="font-medium">{predictionA.riskTier}</span>
                <ArrowRight className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                <span className={`font-semibold ${visualsB.textClass}`}>
                  {predictionB.riskTier}
                </span>
              </>
            )}
          </div>
        </div>

        {/* Scenario B Card */}
        <div className="p-5 flex flex-col justify-between gap-3">
          <div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium uppercase tracking-wider text-slate-400">
                Scenario B
              </span>
              <button
                type="button"
                onClick={() => onLoadScenarioToWorkbench(scenarioB)}
                className="inline-flex items-center gap-1 text-xs font-medium text-blue-400 hover:text-blue-300 whitespace-nowrap shrink-0"
              >
                <SlidersHorizontal className="h-3 w-3" />
                <span>Load B</span>
              </button>
            </div>
            <div className="mt-1 text-sm font-semibold text-slate-100 truncate">
              {scenarioB.name}
            </div>
            <div
              className={`mt-2 font-mono text-3xl font-semibold tabular-nums ${visualsB.textClass}`}
            >
              {predictionB.probabilityPct.toFixed(1)}%
            </div>
          </div>

          <div className="flex items-center gap-1.5 text-xs font-medium">
            <visualsB.Icon
              className={`h-4 w-4 shrink-0 ${visualsB.textClass}`}
              aria-hidden="true"
            />
            <span className={visualsB.textClass}>{predictionB.riskTier}</span>
          </div>
        </div>
      </section>

      {/* Dual Position Risk Scale */}
      <section
        aria-label="Probability Threshold Shift"
        className="bg-[#162032] border border-slate-800 rounded-lg p-5 space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-sm font-semibold text-slate-100">
            Risk Scale Position
          </h2>
          <div className="flex items-center gap-4 text-xs text-slate-300">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-slate-200 inline-block" />
              A: {predictionA.probabilityPct.toFixed(1)}%
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-blue-500 inline-block" />
              B: {predictionB.probabilityPct.toFixed(1)}%
            </span>
          </div>
        </div>

        <div className="pt-5 pb-1">
          <div className="relative h-4 w-full rounded bg-[#0F172A] border border-slate-800 flex">
            <div
              className="h-full bg-teal-500/15 border-r border-slate-700/80 rounded-l"
              style={{ width: '40%' }}
            />
            <div
              className="h-full bg-amber-500/15 border-r border-slate-700/80"
              style={{ width: '30%' }}
            />
            <div
              className="h-full bg-rose-500/15 rounded-r"
              style={{ width: '30%' }}
            />

            {spanWidth > 0.2 && (
              <div
                className={`absolute inset-y-1 transition-all duration-300 ${
                  probDelta < 0 ? 'bg-teal-400/60' : 'bg-rose-500/60'
                }`}
                style={{
                  left: `${minPos}%`,
                  width: `${spanWidth}%`,
                }}
              />
            )}

            {/* Marker A */}
            <div
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 transition-all duration-300"
              style={{ left: `${predictionA.probabilityPct}%` }}
            >
              <span className="absolute -top-6 left-1/2 -translate-x-1/2 font-mono text-[11px] font-semibold text-slate-200 whitespace-nowrap">
                A
              </span>
              <span className="block h-4 w-4 rounded-full bg-slate-200 border-2 border-[#162032] shadow-sm" />
            </div>

            {/* Marker B */}
            <div
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 transition-all duration-300"
              style={{ left: `${predictionB.probabilityPct}%` }}
            >
              <span className="absolute -top-6 left-1/2 -translate-x-1/2 font-mono text-[11px] font-semibold text-blue-400 whitespace-nowrap">
                B
              </span>
              <span className="block h-4 w-4 rounded-full bg-blue-500 border-2 border-[#162032] shadow-sm" />
            </div>
          </div>

          <div className="mt-2 flex items-center justify-between text-[11px] font-mono tabular-nums text-slate-400">
            <span>0% · On Track</span>
            <span>40% · Watch</span>
            <span>70% · Critical</span>
            <span>100%</span>
          </div>
        </div>
      </section>

      {/* Parameter Diff Table + Attribution Comparison */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        <section
          aria-label="Parameter Comparison Matrix"
          className="xl:col-span-7 bg-[#162032] border border-slate-800 rounded-lg overflow-hidden"
        >
          <div className="px-5 py-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-sm font-semibold text-slate-100">
              Parameter Comparison
            </h2>

            <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showChangedOnly}
                onChange={(e) => setShowChangedOnly(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-slate-600 bg-[#0F172A] text-blue-500 focus:ring-blue-500"
              />
              <span>Show differences only ({paramDiffCount})</span>
            </label>
          </div>

          {visibleRows.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-400">
              Scenario A and Scenario B have identical parameter values.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-900/60 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    <th className="py-2.5 px-4">Parameter</th>
                    <th className="py-2.5 px-4">Scenario A</th>
                    <th className="py-2.5 px-4">Scenario B</th>
                    <th className="py-2.5 px-4 text-right">Difference</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 text-xs">
                  {visibleRows.map((row) => {
                    const diff = row.diffLabel(
                      scenarioA.parameters,
                      scenarioB.parameters
                    );
                    const changed = diff !== null;
                    return (
                      <tr
                        key={row.key}
                        className={changed ? 'bg-blue-500/10' : undefined}
                      >
                        <td className="py-2.5 px-4 font-medium text-slate-200 whitespace-nowrap">
                          {row.label}
                        </td>
                        <td className="py-2.5 px-4 font-mono text-slate-400 whitespace-nowrap">
                          {row.format(scenarioA.parameters)}
                        </td>
                        <td
                          className={`py-2.5 px-4 font-mono whitespace-nowrap ${
                            changed
                              ? 'font-semibold text-slate-100'
                              : 'text-slate-400'
                          }`}
                        >
                          {row.format(scenarioB.parameters)}
                        </td>
                        <td
                          className={`py-2.5 px-4 text-right font-mono whitespace-nowrap ${
                            changed
                              ? 'font-semibold text-blue-400'
                              : 'text-slate-600'
                          }`}
                        >
                          {diff ?? '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section
          aria-label="Factor Attribution Impact Comparison"
          className="xl:col-span-5 bg-[#162032] border border-slate-800 rounded-lg overflow-hidden"
        >
          <div className="px-5 py-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-sm font-semibold text-slate-100">
              Risk Contribution Shift (A vs B)
            </h2>
            <div className="flex items-center gap-3 text-[11px] text-slate-400">
              <span className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-xs bg-slate-400 inline-block" />
                A
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-xs bg-blue-500 inline-block" />
                B
              </span>
            </div>
          </div>

          <div className="divide-y divide-slate-800">
            {shapComparison.map((row) => {
              const widthA = Math.min(
                100,
                (Math.abs(row.impactA) / maxBarScale) * 100
              );
              const widthB = Math.min(
                100,
                (Math.abs(row.impactB) / maxBarScale) * 100
              );

              return (
                <div key={row.key} className="px-4 py-3 space-y-2">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-medium text-slate-200 truncate">
                      {row.label}
                    </span>
                    <span
                      className={`font-mono font-semibold tabular-nums whitespace-nowrap ${
                        row.delta < -0.1
                          ? 'text-teal-400'
                          : row.delta > 0.1
                            ? 'text-rose-400'
                            : 'text-slate-500'
                      }`}
                    >
                      {row.delta > 0 ? '+' : ''}
                      {row.delta.toFixed(1)} pp
                    </span>
                  </div>

                  <div className="space-y-1">
                    {/* Bar A */}
                    <div className="flex items-center gap-2 text-[11px] font-mono">
                      <span className="w-4 text-slate-400 shrink-0">A</span>
                      <div className="flex-1 flex items-center h-3">
                        <div className="w-1/2 flex justify-end pr-0.5 border-r border-slate-700 h-full items-center">
                          {row.impactA < -0.05 && (
                            <div
                              className="h-2 rounded-l-xs bg-slate-400"
                              style={{ width: `${widthA}%` }}
                            />
                          )}
                        </div>
                        <div className="w-1/2 flex justify-start pl-0.5 h-full items-center">
                          {row.impactA > 0.05 && (
                            <div
                              className="h-2 rounded-r-xs bg-slate-400"
                              style={{ width: `${widthA}%` }}
                            />
                          )}
                        </div>
                      </div>
                      <span className="w-14 text-right tabular-nums text-slate-400 shrink-0">
                        {row.impactA > 0 ? '+' : ''}
                        {row.impactA.toFixed(1)}
                      </span>
                    </div>

                    {/* Bar B */}
                    <div className="flex items-center gap-2 text-[11px] font-mono">
                      <span className="w-4 text-blue-400 font-semibold shrink-0">
                        B
                      </span>
                      <div className="flex-1 flex items-center h-3">
                        <div className="w-1/2 flex justify-end pr-0.5 border-r border-slate-700 h-full items-center">
                          {row.impactB < -0.05 && (
                            <div
                              className="h-2 rounded-l-xs bg-blue-500"
                              style={{ width: `${widthB}%` }}
                            />
                          )}
                        </div>
                        <div className="w-1/2 flex justify-start pl-0.5 h-full items-center">
                          {row.impactB > 0.05 && (
                            <div
                              className="h-2 rounded-r-xs bg-blue-500"
                              style={{ width: `${widthB}%` }}
                            />
                          )}
                        </div>
                      </div>
                      <span className="w-14 text-right tabular-nums text-blue-400 font-medium shrink-0">
                        {row.impactB > 0 ? '+' : ''}
                        {row.impactB.toFixed(1)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
