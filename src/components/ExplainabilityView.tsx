import { useMemo, useState } from 'react';
import { ArrowDownRight, ArrowRight, RotateCcw } from 'lucide-react';
import type {
  ActiveView,
  PredictionResult,
  ProjectParameters,
  ProjectRecord,
} from '../types/project';
import { predictProjectRisk } from '../utils/riskEngine';

interface ExplainabilityViewProps {
  parameters: ProjectParameters;
  prediction: PredictionResult;
  records: ProjectRecord[];
  onApplyParameters: (next: ProjectParameters) => void;
  onNavigateView: (view: ActiveView) => void;
}

interface MitigationToggle {
  id: string;
  label: string;
  description: string;
  isApplicable: (p: ProjectParameters) => boolean;
  apply: (p: ProjectParameters) => ProjectParameters;
}

const MITIGATION_LEVERS: MitigationToggle[] = [
  {
    id: 'clear-env',
    label: 'Fast-Track Environmental Clearance',
    description: 'Move MoEFCC / SEIAA status to Approved',
    isApplicable: (p) => p.environmental_clearance_status !== 'Approved',
    apply: (p) => ({ ...p, environmental_clearance_status: 'Approved' }),
  },
  {
    id: 'resolve-litigation',
    label: 'Settle Active Court Litigations',
    description: 'Resolve stay orders via Section 64 Authority & Lok Adalat',
    isApplicable: (p) => p.litigations_count > 0,
    apply: (p) => ({ ...p, litigations_count: 0 }),
  },
  {
    id: 'escrow-dispute',
    label: 'Escrow Compensation Differential',
    description: 'Release undisputed 80% award & clear dispute flag',
    isApplicable: (p) => p.compensation_disputed_flag === 1,
    apply: (p) => ({ ...p, compensation_disputed_flag: 0 }),
  },
  {
    id: 'complete-sia',
    label: 'Complete SIA Public Hearing',
    description: 'Finalize Gram Sabha & Section 4 public consultation',
    isApplicable: (p) => p.public_hearing_completed === 0,
    apply: (p) => ({ ...p, public_hearing_completed: 1 }),
  },
  {
    id: 'boost-rehab',
    label: 'Accelerate R&R Completion to 85%',
    description: 'Complete resettlement site utilities & allotment',
    isApplicable: (p) => p.rehabilitation_progress_pct < 85,
    apply: (p) => ({ ...p, rehabilitation_progress_pct: 85 }),
  },
  {
    id: 'cut-latency',
    label: 'Clear PMG Administrative Backlog',
    description: 'Reduce file processing latency to 20 days',
    isApplicable: (p) => p.bureaucratic_delay_days > 25,
    apply: (p) => ({ ...p, bureaucratic_delay_days: 20 }),
  },
];

export default function ExplainabilityView({
  parameters,
  prediction,
  records,
  onApplyParameters,
  onNavigateView,
}: ExplainabilityViewProps) {
  const [selectedLevers, setSelectedLevers] = useState<string[]>([]);

  const simulatedParams = useMemo(() => {
    let next = { ...parameters };
    for (const lever of MITIGATION_LEVERS) {
      if (selectedLevers.includes(lever.id)) {
        next = lever.apply(next);
      }
    }
    return next;
  }, [parameters, selectedLevers]);

  const simulatedPrediction = useMemo(
    () => predictProjectRisk(simulatedParams, records),
    [simulatedParams, records]
  );

  const toggleLever = (id: string) => {
    setSelectedLevers((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const maxAbsImpact = useMemo(() => {
    const maxVal = Math.max(
      ...prediction.shapContributions.map((c) => Math.abs(c.impactPct)),
      5
    );
    return maxVal;
  }, [prediction.shapContributions]);

  const deltaFromCurrent =
    simulatedPrediction.probabilityPct - prediction.probabilityPct;

  return (
    <div className="space-y-6">
      {/* Top Attribution Summary Strip */}
      <section className="bg-[#162032] border border-slate-800 rounded-lg grid grid-cols-1 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-800">
        <div className="p-4 sm:p-5">
          <div className="text-xs font-medium uppercase tracking-wider text-slate-400">
            Baseline Rate
          </div>
          <div className="mt-1.5 font-mono text-2xl font-semibold tabular-nums text-slate-100">
            {prediction.baseProbabilityPct.toFixed(1)}%
          </div>
        </div>

        <div className="p-4 sm:p-5">
          <div className="text-xs font-medium uppercase tracking-wider text-slate-400">
            Net Attribution
          </div>
          <div
            className={`mt-1.5 font-mono text-2xl font-semibold tabular-nums ${
              prediction.probabilityPct >= 50
                ? 'text-rose-400'
                : 'text-teal-400'
            }`}
          >
            {prediction.probabilityPct - prediction.baseProbabilityPct >= 0
              ? '+'
              : ''}
            {(prediction.probabilityPct - prediction.baseProbabilityPct).toFixed(
              1
            )}{' '}
            pp
          </div>
        </div>

        <div className="p-4 sm:p-5">
          <div className="text-xs font-medium uppercase tracking-wider text-slate-400">
            Predicted Risk
          </div>
          <div className="mt-1.5 font-mono text-2xl font-semibold tabular-nums text-slate-100">
            {prediction.probabilityPct.toFixed(1)}%
          </div>
          <div className="mt-1 text-xs text-slate-400">
            {prediction.riskTier}
          </div>
        </div>

        <div className="p-4 sm:p-5 flex flex-col justify-between">
          <div className="text-xs font-medium uppercase tracking-wider text-slate-400">
            Active Corridor
          </div>
          <div className="mt-1 text-sm font-semibold text-slate-100">
            {parameters.project_type} · {parameters.region}
          </div>
          <button
            type="button"
            onClick={() => onNavigateView('assessment')}
            className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-blue-400 hover:text-blue-300 whitespace-nowrap w-fit focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
          >
            <span>Edit inputs in Workbench</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Left: Diverging SHAP Waterfall Chart & Table */}
        <section
          aria-label="SHAP Feature Attribution"
          className="xl:col-span-7 bg-[#162032] border border-slate-800 rounded-lg overflow-hidden"
        >
          <div className="px-5 py-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-sm font-semibold text-slate-100">
              SHAP Feature Attribution
            </h2>
            <div className="flex items-center gap-4 text-xs text-slate-300">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-xs bg-rose-500 inline-block" />
                Increases Risk
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-xs bg-teal-400 inline-block" />
                Mitigates Risk
              </span>
            </div>
          </div>

          <div className="divide-y divide-slate-800">
            {prediction.shapContributions.map((item) => {
              const widthPct = Math.min(
                100,
                (Math.abs(item.impactPct) / maxAbsImpact) * 100
              );
              const isRisk = item.impactPct > 0.05;
              const isMitigation = item.impactPct < -0.05;

              return (
                <div
                  key={item.key}
                  className="px-5 py-3 grid grid-cols-1 sm:grid-cols-12 gap-3 items-center hover:bg-slate-800/40"
                >
                  <div className="sm:col-span-5 min-w-0">
                    <div className="text-sm font-medium text-slate-100 truncate">
                      {item.label}
                    </div>
                    <div className="text-xs font-mono text-slate-400 truncate">
                      {item.displayValue}
                    </div>
                  </div>

                  {/* Diverging Center-Zero Bar */}
                  <div className="sm:col-span-5 flex items-center">
                    <div className="w-1/2 flex justify-end pr-1 border-r border-slate-700 h-5 items-center">
                      {isMitigation && (
                        <div
                          className="h-3 rounded-l-xs bg-teal-400 transition-all duration-300"
                          style={{ width: `${widthPct}%` }}
                        />
                      )}
                    </div>
                    <div className="w-1/2 flex justify-start pl-1 h-5 items-center">
                      {isRisk && (
                        <div
                          className="h-3 rounded-r-xs bg-rose-500 transition-all duration-300"
                          style={{ width: `${widthPct}%` }}
                        />
                      )}
                    </div>
                  </div>

                  <div
                    className={`sm:col-span-2 text-right font-mono text-xs font-semibold tabular-nums whitespace-nowrap ${
                      isRisk
                        ? 'text-rose-400'
                        : isMitigation
                          ? 'text-teal-400'
                          : 'text-slate-500'
                    }`}
                  >
                    {item.impactPct > 0 ? '+' : ''}
                    {item.impactPct.toFixed(1)} pp
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Right: Mitigation Simulator */}
        <section
          aria-label="Mitigation Simulator"
          className="xl:col-span-5 bg-[#162032] border border-slate-800 rounded-lg divide-y divide-slate-800"
        >
          <div className="px-5 py-4 flex items-center justify-between gap-2">
            <h2 className="font-display text-sm font-semibold text-slate-100">
              Mitigation Simulator
            </h2>
            {selectedLevers.length > 0 && (
              <button
                type="button"
                onClick={() => setSelectedLevers([])}
                className="inline-flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-slate-100 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
              >
                <RotateCcw className="h-3 w-3" />
                <span>Clear</span>
              </button>
            )}
          </div>

          {/* Before / After Comparison Banner */}
          <div className="p-5 bg-slate-900/50 grid grid-cols-3 gap-3 items-center">
            <div>
              <div className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
                Current
              </div>
              <div className="mt-1 font-mono text-xl font-semibold tabular-nums text-slate-100">
                {prediction.probabilityPct.toFixed(1)}%
              </div>
            </div>

            <div>
              <div className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
                Simulated
              </div>
              <div
                className={`mt-1 font-mono text-xl font-semibold tabular-nums ${
                  simulatedPrediction.probabilityPct >= 70
                    ? 'text-rose-400'
                    : simulatedPrediction.probabilityPct >= 40
                      ? 'text-amber-400'
                      : 'text-teal-400'
                }`}
              >
                {simulatedPrediction.probabilityPct.toFixed(1)}%
              </div>
            </div>

            <div className="text-right">
              <div className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
                Net Delta
              </div>
              <div className="mt-1 inline-flex items-center justify-end gap-1 font-mono text-base font-semibold tabular-nums text-teal-400">
                {deltaFromCurrent < -0.05 && (
                  <ArrowDownRight className="h-4 w-4 shrink-0" />
                )}
                <span>
                  {deltaFromCurrent > 0 ? '+' : ''}
                  {deltaFromCurrent.toFixed(1)} pp
                </span>
              </div>
            </div>
          </div>

          {/* Mitigation Checkboxes */}
          <div className="divide-y divide-slate-800">
            {MITIGATION_LEVERS.map((lever) => {
              const applicable = lever.isApplicable(parameters);
              const checked = selectedLevers.includes(lever.id);
              return (
                <label
                  key={lever.id}
                  className={`flex items-start gap-3 px-5 py-3.5 transition-colors ${
                    applicable
                      ? 'cursor-pointer hover:bg-slate-800/40'
                      : 'opacity-45 cursor-not-allowed bg-slate-900/30'
                  }`}
                >
                  <input
                    type="checkbox"
                    disabled={!applicable}
                    checked={applicable && checked}
                    onChange={() => toggleLever(lever.id)}
                    className="mt-0.5 h-4 w-4 rounded border-slate-600 bg-[#0F172A] text-blue-500 focus:ring-blue-500"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-slate-100">
                      {lever.label}
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      {applicable
                        ? lever.description
                        : 'Already satisfied in current profile'}
                    </div>
                  </div>
                </label>
              );
            })}
          </div>

          <div className="p-4 flex items-center justify-between gap-3">
            <span className="text-xs text-slate-400">
              {simulatedPrediction.riskTier}
            </span>
            <button
              type="button"
              disabled={selectedLevers.length === 0 || deltaFromCurrent === 0}
              onClick={() => {
                onApplyParameters(simulatedParams);
                setSelectedLevers([]);
              }}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-blue-600 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              <span>Apply to Workbench</span>
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
