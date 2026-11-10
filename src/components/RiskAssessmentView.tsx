import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Columns2,
  ShieldAlert,
  Trash2,
} from 'lucide-react';
import type {
  ActiveView,
  PredictionResult,
  ProjectParameters,
  ProjectRecord,
  RiskTier,
  SavedScenario,
} from '../types/project';
import ParameterSidebar from './ParameterSidebar';

interface RiskAssessmentViewProps {
  parameters: ProjectParameters;
  prediction: PredictionResult;
  records: ProjectRecord[];
  savedScenarios: SavedScenario[];
  onChangeParameters: (next: ProjectParameters) => void;
  onSaveScenario: (customName?: string) => void;
  onLoadScenario: (scenario: SavedScenario) => void;
  onDeleteScenario: (id: string) => void;
  onNavigateView: (view: ActiveView) => void;
}

function getTierStyles(tier: RiskTier): {
  textClass: string;
  barColor: string;
  Icon: typeof CheckCircle2;
} {
  switch (tier) {
    case 'Critical Risk':
      return {
        textClass: 'text-rose-400',
        barColor: '#F43F5E',
        Icon: ShieldAlert,
      };
    case 'Moderate Watch':
      return {
        textClass: 'text-amber-400',
        barColor: '#F59E0B',
        Icon: AlertTriangle,
      };
    case 'Low Risk / On Track':
      return {
        textClass: 'text-teal-400',
        barColor: '#14B8A6',
        Icon: CheckCircle2,
      };
  }
}

export default function RiskAssessmentView({
  parameters,
  prediction,
  records,
  savedScenarios,
  onChangeParameters,
  onSaveScenario,
  onLoadScenario,
  onDeleteScenario,
  onNavigateView,
}: RiskAssessmentViewProps) {
  const { textClass, barColor, Icon: StatusIcon } = getTierStyles(
    prediction.riskTier
  );

  const slippageTextClass =
    prediction.delayForecast.severityLabel === 'Severe Overrun'
      ? 'text-rose-400'
      : prediction.delayForecast.severityLabel === 'Moderate Slippage'
        ? 'text-amber-400'
        : 'text-teal-400';

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
      <div className="xl:col-span-4">
        <ParameterSidebar
          parameters={parameters}
          onChange={onChangeParameters}
          onSaveScenario={onSaveScenario}
        />
      </div>

      <div className="xl:col-span-8 space-y-6">
        {/* 4-Column Dual-Target KPI Strip */}
        <section
          aria-label="Risk Summary"
          className="bg-[#162032] border border-slate-800 rounded-lg grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-800"
        >
          <div className="p-5">
            <div className="text-xs font-medium uppercase tracking-wider text-slate-400">
              Delay Probability
            </div>
            <div
              className={`mt-2 font-mono text-3xl font-semibold tabular-nums tracking-tight ${textClass}`}
            >
              {prediction.probabilityPct.toFixed(1)}%
            </div>
            <div className="mt-1.5 text-xs text-slate-400 font-mono tabular-nums">
              Risk score {prediction.delayScore.toFixed(2)}
            </div>
          </div>

          <div className="p-5">
            <div className="text-xs font-medium uppercase tracking-wider text-slate-400">
              Est. Schedule Slippage
            </div>
            <div
              className={`mt-2 font-mono text-2xl font-semibold tabular-nums tracking-tight ${slippageTextClass}`}
            >
              +{prediction.delayForecast.expectedDelayDays}d
            </div>
            <div className="mt-1.5 text-xs text-slate-400 font-mono tabular-nums">
              Band {prediction.delayForecast.rangeMinDays}–
              {prediction.delayForecast.rangeMaxDays}d
            </div>
          </div>

          <div className="p-5">
            <div className="text-xs font-medium uppercase tracking-wider text-slate-400">
              Risk Status
            </div>
            <div className={`mt-2.5 flex items-center gap-2 ${textClass}`}>
              <StatusIcon className="h-5 w-5 shrink-0" aria-hidden="true" />
              <span className="font-display text-base font-semibold leading-tight">
                {prediction.riskTier}
              </span>
            </div>
            <div className="mt-1.5 text-xs text-slate-400">
              {prediction.predictedDelayed === 1
                ? 'Above 50% delay threshold'
                : 'Within schedule tolerance'}
            </div>
          </div>

          <div className="p-5">
            <div className="text-xs font-medium uppercase tracking-wider text-slate-400">
              Primary Driver
            </div>
            <div className="mt-2 font-display text-sm font-semibold text-slate-100 leading-snug">
              {prediction.primaryDriver}
            </div>
            <div className="mt-1.5 text-xs text-slate-400 truncate">
              {prediction.secondaryDriver}
            </div>
          </div>
        </section>

        {/* Threshold Scale, Cohort Benchmark & Engineered Signals */}
        <section
          aria-label="Risk Threshold, Historical Benchmark, and Engineered Features"
          className="bg-[#162032] border border-slate-800 rounded-lg p-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <h2 className="font-display text-sm font-semibold text-slate-100">
              Risk Threshold & Historical Cohort
            </h2>
            <button
              type="button"
              onClick={() => onNavigateView('explainability')}
              className="inline-flex items-center gap-1 text-xs font-medium text-blue-400 hover:text-blue-300 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
            >
              <span>Inspect SHAP drivers</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="space-y-2">
            <div className="relative h-4 w-full rounded bg-[#0F172A] overflow-hidden flex border border-slate-800">
              <div
                className="h-full bg-teal-500/15 border-r border-slate-700/80"
                style={{ width: '40%' }}
              />
              <div
                className="h-full bg-amber-500/15 border-r border-slate-700/80"
                style={{ width: '30%' }}
              />
              <div
                className="h-full bg-rose-500/15"
                style={{ width: '30%' }}
              />
              <div
                className="absolute inset-y-0 left-0 transition-all duration-300"
                style={{
                  width: `${prediction.probabilityPct}%`,
                  backgroundColor: barColor,
                  opacity: 0.78,
                }}
              />
              <div
                className="absolute inset-y-0 w-0.5 bg-slate-100 transition-all duration-300"
                style={{
                  left: `calc(${Math.min(99.5, Math.max(0.5, prediction.probabilityPct))}% - 1px)`,
                }}
              />
            </div>

            <div className="flex items-center justify-between text-[11px] font-mono tabular-nums text-slate-400">
              <span>0% · On Track</span>
              <span>40% · Watch</span>
              <span>70% · Critical</span>
              <span>100%</span>
            </div>
          </div>

          <div className="mt-5 pt-4 border-t border-slate-800 grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div>
              <div className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
                Cohort
              </div>
              <div className="mt-1 text-xs font-medium text-slate-200">
                {prediction.cohortStats.scopeLabel}
              </div>
            </div>
            <div>
              <div className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
                Matched Projects
              </div>
              <div className="mt-1 font-mono text-sm font-semibold tabular-nums text-slate-100">
                {records.length > 0
                  ? `${prediction.cohortStats.matchedCount}`
                  : '—'}
              </div>
            </div>
            <div>
              <div className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
                Historical Delay Rate
              </div>
              <div className="mt-1 font-mono text-sm font-semibold tabular-nums text-slate-100">
                {records.length > 0
                  ? `${prediction.cohortStats.historicalDelayRatePct.toFixed(1)}%`
                  : '—'}
              </div>
            </div>
            <div>
              <div className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
                Avg R&R / Suits
              </div>
              <div className="mt-1 font-mono text-sm font-semibold tabular-nums text-slate-100">
                {records.length > 0
                  ? `${prediction.cohortStats.avgRehabPct.toFixed(0)}% · ${prediction.cohortStats.avgLitigations.toFixed(1)}`
                  : '—'}
              </div>
            </div>
          </div>

          {/* Engineered Interaction Features */}
          <div className="mt-4 pt-4 border-t border-slate-800 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <div className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
                Displacement Density
              </div>
              <div className="mt-1 font-mono text-sm font-semibold tabular-nums text-slate-100">
                {prediction.engineered.displacementDensity.toFixed(2)}{' '}
                <span className="text-xs font-normal text-slate-400">
                  families/ha
                </span>
              </div>
            </div>
            <div>
              <div className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
                Legal Friction Index
              </div>
              <div
                className={`mt-1 font-mono text-sm font-semibold tabular-nums ${
                  prediction.engineered.legalFrictionIndex >= 2
                    ? 'text-rose-400'
                    : prediction.engineered.legalFrictionIndex === 1
                      ? 'text-amber-400'
                      : 'text-slate-100'
                }`}
              >
                {prediction.engineered.legalFrictionIndex}{' '}
                <span className="text-xs font-normal text-slate-400">
                  (suits × dispute)
                </span>
              </div>
            </div>
            <div>
              <div className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
                Statutory Readiness Gap
              </div>
              <div
                className={`mt-1 font-mono text-sm font-semibold tabular-nums ${
                  prediction.engineered.statutoryGapScore >= 2
                    ? 'text-rose-400'
                    : prediction.engineered.statutoryGapScore === 1
                      ? 'text-amber-400'
                      : 'text-teal-400'
                }`}
              >
                {prediction.engineered.statutoryGapScore} / 3{' '}
                <span className="text-xs font-normal text-slate-400">
                  clearances open
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Recommended Actions */}
        <section
          aria-label="Recommended Actions"
          className="bg-[#162032] border border-slate-800 rounded-lg divide-y divide-slate-800"
        >
          <div className="px-5 py-4 flex items-center justify-between gap-2">
            <h2 className="font-display text-sm font-semibold text-slate-100">
              Recommended Actions
            </h2>
            <span className="font-mono text-xs text-slate-400 whitespace-nowrap">
              {prediction.recommendations.length}{' '}
              {prediction.recommendations.length === 1 ? 'action' : 'actions'}
            </span>
          </div>

          {prediction.recommendations.map((rec) => {
            const priorityClass =
              rec.priority === 'Immediate'
                ? 'text-rose-400'
                : rec.priority === 'Targeted'
                  ? 'text-amber-400'
                  : 'text-teal-400';

            return (
              <div key={rec.id} className="px-5 py-4 space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      className={`font-mono text-[11px] font-semibold uppercase tracking-wider ${priorityClass}`}
                    >
                      {rec.priority}
                    </span>
                    <span className="text-slate-600" aria-hidden="true">
                      /
                    </span>
                    <h3 className="text-sm font-semibold text-slate-100">
                      {rec.title}
                    </h3>
                  </div>
                  <div className="text-xs text-slate-400 font-mono whitespace-nowrap">
                    {rec.horizon}
                  </div>
                </div>
                <p className="text-sm text-slate-300 leading-relaxed">
                  {rec.action}
                </p>
                <div className="text-xs text-slate-400">
                  Authority:{' '}
                  <span className="font-medium text-slate-200">
                    {rec.authority}
                  </span>
                </div>
              </div>
            );
          })}
        </section>

        {/* Saved Scenarios */}
        {savedScenarios.length > 0 && (
          <section
            aria-label="Saved Scenarios"
            className="bg-[#162032] border border-slate-800 rounded-lg overflow-hidden"
          >
            <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between gap-2">
              <h2 className="font-display text-sm font-semibold text-slate-100">
                Saved Scenarios ({savedScenarios.length})
              </h2>
              {savedScenarios.length >= 2 && (
                <button
                  type="button"
                  onClick={() => onNavigateView('comparison')}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-400 hover:text-blue-300 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
                >
                  <Columns2 className="h-3.5 w-3.5" />
                  <span>Compare Side-by-Side</span>
                </button>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-900/60 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    <th className="py-2.5 px-4">Scenario</th>
                    <th className="py-2.5 px-4">Corridor</th>
                    <th className="py-2.5 px-4 text-right">Delay Prob.</th>
                    <th className="py-2.5 px-4">Status</th>
                    <th className="py-2.5 px-4">Primary Driver</th>
                    <th className="py-2.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 text-sm">
                  {savedScenarios.map((sc) => {
                    const styles = getTierStyles(sc.riskTier);
                    return (
                      <tr key={sc.id} className="hover:bg-slate-800/40">
                        <td className="py-2.5 px-4 font-medium text-slate-100 whitespace-nowrap">
                          {sc.name}
                          <div className="text-[11px] font-mono text-slate-500">
                            {sc.savedAt}
                          </div>
                        </td>
                        <td className="py-2.5 px-4 text-slate-300 whitespace-nowrap">
                          {sc.parameters.project_type} · {sc.parameters.region}
                        </td>
                        <td
                          className={`py-2.5 px-4 text-right font-mono font-semibold tabular-nums whitespace-nowrap ${styles.textClass}`}
                        >
                          {sc.probabilityPct.toFixed(1)}%
                        </td>
                        <td
                          className={`py-2.5 px-4 text-xs font-medium whitespace-nowrap ${styles.textClass}`}
                        >
                          {sc.riskTier}
                        </td>
                        <td className="py-2.5 px-4 text-xs text-slate-300">
                          {sc.primaryDriver}
                        </td>
                        <td className="py-2.5 px-4 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => onLoadScenario(sc)}
                              className="text-xs font-medium text-blue-400 hover:text-blue-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded px-1.5 py-0.5"
                            >
                              Load
                            </button>
                            <button
                              type="button"
                              onClick={() => onDeleteScenario(sc.id)}
                              aria-label={`Delete ${sc.name}`}
                              className="text-slate-500 hover:text-rose-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded p-1"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
