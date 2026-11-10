import { useMemo, useState } from 'react';
import type {
  CategoryBreakdown,
  DatasetStats,
  SupervisedEvaluationSuite,
  SupervisedModelId,
} from '../types/project';
import { computeMetricsAtThreshold } from '../utils/supervisedModels';

interface ModelValidationViewProps {
  stats: DatasetStats;
  evaluationSuite: SupervisedEvaluationSuite | null;
  loading: boolean;
}

type ValidationTab = 'benchmarks' | 'calibration' | 'diagnostics';

const MODEL_COLORS: Record<SupervisedModelId, string> = {
  logistic: '#94A3B8',
  random_forest: '#FBBF24',
  gradient_boosting: '#2DD4BF',
  calibrated_gbm: '#60A5FA',
};

function BreakdownBars({
  title,
  items,
}: {
  title: string;
  items: CategoryBreakdown[];
}) {
  return (
    <section className="bg-[#162032] border border-slate-800 rounded-lg p-5 space-y-4">
      <h3 className="font-display text-sm font-semibold text-slate-100">
        {title}
      </h3>

      <div className="space-y-3">
        {items.map((item) => {
          const barColor =
            item.delayRatePct >= 65
              ? 'bg-rose-500'
              : item.delayRatePct >= 45
                ? 'bg-amber-400'
                : 'bg-teal-400';

          return (
            <div key={item.label} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-slate-200">{item.label}</span>
                <span className="font-mono tabular-nums text-slate-400">
                  <span className="font-semibold text-slate-100">
                    {item.delayRatePct.toFixed(1)}%
                  </span>{' '}
                  <span className="text-slate-500">
                    ({item.delayed}/{item.total})
                  </span>
                </span>
              </div>
              <div className="h-2 w-full rounded-xs bg-[#0F172A] overflow-hidden">
                <div
                  className={`h-full ${barColor} transition-all duration-300`}
                  style={{ width: `${Math.min(100, item.delayRatePct)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default function ModelValidationView({
  stats,
  evaluationSuite,
  loading,
}: ModelValidationViewProps) {
  const [activeTab, setActiveTab] = useState<ValidationTab>('benchmarks');
  const [selectedModelId, setSelectedModelId] =
    useState<SupervisedModelId>('calibrated_gbm');
  const [decisionThreshold, setDecisionThreshold] = useState<number>(0.5);

  const selectedModel = useMemo(() => {
    if (!evaluationSuite) return null;
    return (
      evaluationSuite.models.find((m) => m.id === selectedModelId) ??
      evaluationSuite.models[evaluationSuite.models.length - 1]
    );
  }, [evaluationSuite, selectedModelId]);

  const thresholdMetrics = useMemo(() => {
    if (!evaluationSuite || !selectedModel) return null;
    return computeMetricsAtThreshold(
      evaluationSuite.yTest,
      selectedModel.testProbas,
      decisionThreshold
    );
  }, [evaluationSuite, selectedModel, decisionThreshold]);

  // SVG plot geometry
  const padL = 38;
  const padR = 16;
  const padT = 16;
  const padB = 30;
  const plotW = 320 - padL - padR;
  const plotH = 210 - padT - padB;
  const toX = (v: number) => padL + v * plotW;
  const toY = (v: number) => padT + (1 - v) * plotH;

  if (loading || !evaluationSuite || !selectedModel || !thresholdMetrics) {
    return (
      <div className="bg-[#162032] border border-slate-800 rounded-lg p-6 space-y-3">
        <div className="text-sm text-slate-300">
          Training and evaluating supervised models on dataset…
        </div>
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-10 rounded bg-slate-800/70 animate-pulse"
          />
        ))}
      </div>
    );
  }

  const maxPermDrop = Math.max(
    0.01,
    ...evaluationSuite.permutationImportance.map((p) => p.aucDrop)
  );

  const minLcAuc = Math.max(
    0.5,
    Math.floor(
      (Math.min(
        ...evaluationSuite.learningCurve.flatMap((pt) => [
          pt.trainAuc,
          pt.valAuc,
        ])
      ) -
        0.05) *
        20
    ) / 20
  );

  return (
    <div className="space-y-6">
      {/* Sub-navigation Tabs + Active Split Scope */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          role="tablist"
          aria-label="Validation Views"
          className="inline-flex rounded-md border border-slate-800 bg-[#162032] p-1 gap-1"
        >
          {(
            [
              { id: 'benchmarks', label: 'Benchmarks & ROC' },
              { id: 'calibration', label: 'Calibration & Thresholds' },
              { id: 'diagnostics', label: 'Diagnostics & Cohort' },
            ] as const
          ).map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setActiveTab(tab.id)}
                className={`px-3 py-1.5 rounded text-xs font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                  active
                    ? 'bg-slate-800 text-slate-100 border border-slate-700'
                    : 'text-slate-400 hover:text-slate-200 border border-transparent'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="text-xs font-mono text-slate-400 whitespace-nowrap">
          Train n={evaluationSuite.trainCount.toLocaleString()} · Hold-Out Test n=
          {evaluationSuite.testCount.toLocaleString()} · {evaluationSuite.featureCount}{' '}
          features
        </div>
      </div>

      {/* TAB 1: Multi-Model Benchmarks, ROC Overlay, and Delay-Days Regression */}
      {activeTab === 'benchmarks' && (
        <div className="space-y-6">
          {/* Active Model 5-Metric KPI Strip */}
          <section
            aria-label="Selected Classifier Metrics"
            className="bg-[#162032] border border-slate-800 rounded-lg grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 divide-y sm:divide-y-0 sm:divide-x divide-slate-800"
          >
            {[
              {
                label: 'Accuracy',
                value: `${(selectedModel.accuracy * 100).toFixed(1)}%`,
                note: selectedModel.name,
              },
              {
                label: 'Precision',
                value: `${(selectedModel.precision * 100).toFixed(1)}%`,
                note: 'Positive predictive value',
              },
              {
                label: 'Recall',
                value: `${(selectedModel.recall * 100).toFixed(1)}%`,
                note: 'Delay capture rate',
              },
              {
                label: 'F1 / F2 Score',
                value: `${(selectedModel.f1 * 100).toFixed(1)}%`,
                note: `F2: ${(selectedModel.f2 * 100).toFixed(1)}%`,
              },
              {
                label: 'ROC-AUC',
                value: selectedModel.rocAuc.toFixed(3),
                note: `Brier: ${selectedModel.brierScore.toFixed(3)}`,
              },
            ].map((m) => (
              <div key={m.label} className="p-4 sm:p-5">
                <div className="text-xs font-medium uppercase tracking-wider text-slate-400">
                  {m.label}
                </div>
                <div className="mt-1.5 font-mono text-2xl font-semibold tabular-nums text-slate-100">
                  {m.value}
                </div>
                <div className="mt-1 text-xs text-slate-400 truncate">
                  {m.note}
                </div>
              </div>
            ))}
          </section>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Multi-Model Comparison Table */}
            <section
              aria-label="Multi-Model Benchmark Table"
              className="lg:col-span-7 bg-[#162032] border border-slate-800 rounded-lg overflow-hidden"
            >
              <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between gap-2">
                <h2 className="font-display text-sm font-semibold text-slate-100">
                  Multi-Model Benchmark (Hold-Out Split)
                </h2>
                <span className="text-xs text-slate-400">
                  Select a row to inspect
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 bg-slate-900/60 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                      <th className="py-2.5 px-4">Model</th>
                      <th className="py-2.5 px-3 text-right">Acc</th>
                      <th className="py-2.5 px-3 text-right">F1</th>
                      <th className="py-2.5 px-3 text-right">F2</th>
                      <th className="py-2.5 px-3 text-right">ROC-AUC</th>
                      <th className="py-2.5 px-3 text-right">PR-AUC</th>
                      <th className="py-2.5 px-4 text-right">Brier</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 text-xs">
                    {evaluationSuite.models.map((m) => {
                      const isSelected = m.id === selectedModel.id;
                      return (
                        <tr
                          key={m.id}
                          onClick={() => setSelectedModelId(m.id)}
                          className={`cursor-pointer transition-colors ${
                            isSelected
                              ? 'bg-blue-500/10'
                              : 'hover:bg-slate-800/40'
                          }`}
                        >
                          <td className="py-3 px-4 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <span
                                className="h-2.5 w-2.5 rounded-xs shrink-0"
                                style={{ backgroundColor: MODEL_COLORS[m.id] }}
                              />
                              <div>
                                <div className="font-medium text-slate-100">
                                  {m.name}
                                </div>
                                <div className="text-[11px] text-slate-400">
                                  {m.family}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-200">
                            {(m.accuracy * 100).toFixed(1)}%
                          </td>
                          <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-200">
                            {(m.f1 * 100).toFixed(1)}%
                          </td>
                          <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-200">
                            {(m.f2 * 100).toFixed(1)}%
                          </td>
                          <td className="py-3 px-3 text-right font-mono font-semibold tabular-nums text-blue-400">
                            {m.rocAuc.toFixed(3)}
                          </td>
                          <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-200">
                            {m.prAuc.toFixed(3)}
                          </td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums text-teal-400">
                            {m.brierScore.toFixed(3)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Dual-Target Regression Benchmark Row */}
              <div className="border-t border-slate-800 p-5 bg-slate-900/40 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-display text-xs font-semibold uppercase tracking-wider text-slate-300">
                    Dual-Target Regression: Schedule Overrun (Days)
                  </h3>
                  <span className="font-mono text-xs text-slate-400">
                    {evaluationSuite.regressionBenchmark.modelName}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <div className="text-[11px] text-slate-400">
                      Mean Absolute Error (MAE)
                    </div>
                    <div className="mt-1 font-mono text-lg font-semibold tabular-nums text-slate-100">
                      {evaluationSuite.regressionBenchmark.maeDays.toFixed(1)}{' '}
                      days
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-400">
                      Root Mean Squared Error
                    </div>
                    <div className="mt-1 font-mono text-lg font-semibold tabular-nums text-slate-100">
                      {evaluationSuite.regressionBenchmark.rmseDays.toFixed(1)}{' '}
                      days
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-400">
                      Explained Variance (R²)
                    </div>
                    <div className="mt-1 font-mono text-lg font-semibold tabular-nums text-teal-400">
                      {evaluationSuite.regressionBenchmark.r2Score.toFixed(3)}
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* Multi-Model ROC Curve Overlay */}
            <section
              aria-label="Multi-Model ROC Curve Overlay"
              className="lg:col-span-5 bg-[#162032] border border-slate-800 rounded-lg p-5 space-y-4"
            >
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-display text-sm font-semibold text-slate-100">
                  ROC Curve Overlay
                </h2>
                <span className="font-mono text-xs text-blue-400">
                  Best AUC:{' '}
                  {Math.max(
                    ...evaluationSuite.models.map((m) => m.rocAuc)
                  ).toFixed(3)}
                </span>
              </div>

              <svg
                viewBox="0 0 320 210"
                className="w-full max-w-md mx-auto overflow-visible"
                role="img"
                aria-label="Multi-model ROC curve comparison"
              >
                {[0, 0.25, 0.5, 0.75, 1].map((t) => (
                  <g key={t}>
                    <line
                      x1={padL}
                      y1={toY(t)}
                      x2={padL + plotW}
                      y2={toY(t)}
                      stroke="#1E293B"
                      strokeWidth="1"
                    />
                    <line
                      x1={toX(t)}
                      y1={padT}
                      x2={toX(t)}
                      y2={padT + plotH}
                      stroke="#1E293B"
                      strokeWidth="1"
                    />
                    <text
                      x={padL - 6}
                      y={toY(t) + 3}
                      textAnchor="end"
                      className="fill-slate-400 font-mono text-[8px]"
                    >
                      {t.toFixed(2)}
                    </text>
                    <text
                      x={toX(t)}
                      y={padT + plotH + 12}
                      textAnchor="middle"
                      className="fill-slate-400 font-mono text-[8px]"
                    >
                      {t.toFixed(2)}
                    </text>
                  </g>
                ))}

                <line
                  x1={toX(0)}
                  y1={toY(0)}
                  x2={toX(1)}
                  y2={toY(1)}
                  stroke="#475569"
                  strokeDasharray="3 3"
                  strokeWidth="1"
                />

                {evaluationSuite.models.map((m) => {
                  const pathD = m.rocCurve
                    .map(
                      (pt, idx) =>
                        `${idx === 0 ? 'M' : 'L'} ${toX(pt.fpr).toFixed(1)} ${toY(pt.tpr).toFixed(1)}`
                    )
                    .join(' ');
                  const active = m.id === selectedModel.id;
                  return (
                    <path
                      key={m.id}
                      d={pathD}
                      fill="none"
                      stroke={MODEL_COLORS[m.id]}
                      strokeWidth={active ? '2.4' : '1.4'}
                      strokeOpacity={active ? '1' : '0.65'}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  );
                })}

                <text
                  x={padL + plotW / 2}
                  y={205}
                  textAnchor="middle"
                  className="fill-slate-400 text-[9px] font-medium"
                >
                  False Positive Rate
                </text>
                <text
                  x={10}
                  y={padT + plotH / 2}
                  textAnchor="middle"
                  transform={`rotate(-90 10 ${padT + plotH / 2})`}
                  className="fill-slate-400 text-[9px] font-medium"
                >
                  True Positive Rate
                </text>
              </svg>

              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800 text-xs">
                {evaluationSuite.models.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between gap-2"
                  >
                    <span className="flex items-center gap-1.5 text-slate-300 truncate">
                      <span
                        className="h-2 w-2 rounded-xs shrink-0"
                        style={{ backgroundColor: MODEL_COLORS[m.id] }}
                      />
                      <span className="truncate">{m.name}</span>
                    </span>
                    <span className="font-mono text-slate-200 shrink-0">
                      {m.rocAuc.toFixed(3)}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
      )}

      {/* TAB 2: Probability Calibration (Platt Scaling) & Cost-Sensitive Threshold Tuning */}
      {activeTab === 'calibration' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Calibration Curve */}
          <section
            aria-label="Probability Calibration Curve"
            className="lg:col-span-6 bg-[#162032] border border-slate-800 rounded-lg p-5 space-y-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display text-sm font-semibold text-slate-100">
                Reliability Curve (Platt Calibration)
              </h2>
              <div className="font-mono text-xs text-slate-300">
                Brier:{' '}
                <span className="text-amber-400">
                  {evaluationSuite.uncalibratedBrier.toFixed(3)}
                </span>{' '}
                →{' '}
                <span className="text-teal-400 font-semibold">
                  {evaluationSuite.calibratedBrier.toFixed(3)}
                </span>
              </div>
            </div>

            <svg
              viewBox="0 0 320 210"
              className="w-full max-w-md mx-auto overflow-visible"
              role="img"
              aria-label="Probability calibration reliability curve"
            >
              {[0, 0.25, 0.5, 0.75, 1].map((t) => (
                <g key={t}>
                  <line
                    x1={padL}
                    y1={toY(t)}
                    x2={padL + plotW}
                    y2={toY(t)}
                    stroke="#1E293B"
                    strokeWidth="1"
                  />
                  <line
                    x1={toX(t)}
                    y1={padT}
                    x2={toX(t)}
                    y2={padT + plotH}
                    stroke="#1E293B"
                    strokeWidth="1"
                  />
                  <text
                    x={padL - 6}
                    y={toY(t) + 3}
                    textAnchor="end"
                    className="fill-slate-400 font-mono text-[8px]"
                  >
                    {Math.round(t * 100)}%
                  </text>
                  <text
                    x={toX(t)}
                    y={padT + plotH + 12}
                    textAnchor="middle"
                    className="fill-slate-400 font-mono text-[8px]"
                  >
                    {Math.round(t * 100)}%
                  </text>
                </g>
              ))}

              {/* Ideal Calibration Diagonal */}
              <line
                x1={toX(0)}
                y1={toY(0)}
                x2={toX(1)}
                y2={toY(1)}
                stroke="#64748B"
                strokeDasharray="3 3"
                strokeWidth="1"
              />

              {/* Uncalibrated RF Line */}
              <path
                d={evaluationSuite.calibrationBins
                  .map(
                    (b, idx) =>
                      `${idx === 0 ? 'M' : 'L'} ${toX(b.meanPredictedUncalibrated).toFixed(1)} ${toY(b.empiricalFraction).toFixed(1)}`
                  )
                  .join(' ')}
                fill="none"
                stroke="#FBBF24"
                strokeWidth="1.6"
                strokeDasharray="4 2"
              />

              {/* Calibrated GBM Line */}
              <path
                d={evaluationSuite.calibrationBins
                  .map(
                    (b, idx) =>
                      `${idx === 0 ? 'M' : 'L'} ${toX(b.meanPredictedCalibrated).toFixed(1)} ${toY(b.empiricalFraction).toFixed(1)}`
                  )
                  .join(' ')}
                fill="none"
                stroke="#60A5FA"
                strokeWidth="2.2"
              />

              {evaluationSuite.calibrationBins.map((b) => (
                <circle
                  key={b.binLabel}
                  cx={toX(b.meanPredictedCalibrated)}
                  cy={toY(b.empiricalFraction)}
                  r="3.2"
                  fill="#60A5FA"
                  stroke="#162032"
                  strokeWidth="1.2"
                />
              ))}

              <text
                x={padL + plotW / 2}
                y={205}
                textAnchor="middle"
                className="fill-slate-400 text-[9px] font-medium"
              >
                Predicted Delay Probability
              </text>
              <text
                x={10}
                y={padT + plotH / 2}
                textAnchor="middle"
                transform={`rotate(-90 10 ${padT + plotH / 2})`}
                className="fill-slate-400 text-[9px] font-medium"
              >
                Observed Delay Rate
              </text>
            </svg>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800 text-xs text-slate-300">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-xs bg-blue-400 inline-block" />
                Calibrated GBM (Platt)
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-xs bg-amber-400 inline-block" />
                Uncalibrated Random Forest
              </span>
              <span className="text-slate-400">Dashed grey: Ideal y = x</span>
            </div>
          </section>

          {/* Cost-Sensitive Decision Threshold Tuner + PR Curve */}
          <section
            aria-label="Cost-Sensitive Threshold Tuning"
            className="lg:col-span-6 bg-[#162032] border border-slate-800 rounded-lg p-5 space-y-5"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display text-sm font-semibold text-slate-100">
                Cost-Sensitive Threshold Tuning ({selectedModel.name})
              </h2>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() =>
                    setDecisionThreshold(evaluationSuite.f2OptimalThreshold)
                  }
                  className="px-2 py-1 rounded border border-slate-700 bg-slate-800/80 text-[11px] font-medium text-blue-300 hover:bg-slate-800 whitespace-nowrap"
                >
                  F2-Optimal ({evaluationSuite.f2OptimalThreshold.toFixed(2)})
                </button>
                <button
                  type="button"
                  onClick={() => setDecisionThreshold(0.5)}
                  className="px-2 py-1 rounded border border-slate-700 bg-slate-800/80 text-[11px] font-medium text-slate-300 hover:bg-slate-800 whitespace-nowrap"
                >
                  Default (0.50)
                </button>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5 text-xs">
                <span className="text-slate-300">
                  Alert Cutoff Threshold (Lower prioritizes Recall / fewer missed delays)
                </span>
                <span className="font-mono font-semibold text-slate-100">
                  {Math.round(decisionThreshold * 100)}%
                </span>
              </div>
              <input
                type="range"
                aria-label="Decision threshold"
                min={0.2}
                max={0.8}
                step={0.02}
                value={decisionThreshold}
                onChange={(e) => setDecisionThreshold(Number(e.target.value))}
                className="w-full risk-slider"
              />
            </div>

            <div className="grid grid-cols-4 gap-3 text-xs pt-1">
              <div>
                <div className="text-slate-400">Precision</div>
                <div className="mt-1 font-mono text-base font-semibold tabular-nums text-slate-100">
                  {(thresholdMetrics.precision * 100).toFixed(1)}%
                </div>
              </div>
              <div>
                <div className="text-slate-400">Recall</div>
                <div className="mt-1 font-mono text-base font-semibold tabular-nums text-teal-400">
                  {(thresholdMetrics.recall * 100).toFixed(1)}%
                </div>
              </div>
              <div>
                <div className="text-slate-400">F1 Score</div>
                <div className="mt-1 font-mono text-base font-semibold tabular-nums text-slate-100">
                  {(thresholdMetrics.f1 * 100).toFixed(1)}%
                </div>
              </div>
              <div>
                <div className="text-slate-400">F2 Score</div>
                <div className="mt-1 font-mono text-base font-semibold tabular-nums text-blue-400">
                  {(thresholdMetrics.f2 * 100).toFixed(1)}%
                </div>
              </div>
            </div>

            {/* Live Confusion Matrix at Selected Threshold */}
            <div className="grid grid-cols-3 gap-2 text-xs pt-2 border-t border-slate-800">
              <div />
              <div className="text-center font-medium text-slate-400 pb-1">
                Pred: On Track
              </div>
              <div className="text-center font-medium text-slate-400 pb-1">
                Pred: Delayed
              </div>

              <div className="flex items-center font-medium text-slate-300 pr-2">
                Actual: On Track
              </div>
              <div className="border border-teal-500/30 rounded-md p-2.5 bg-teal-500/10 text-center">
                <div className="font-mono text-lg font-semibold tabular-nums text-teal-300">
                  {thresholdMetrics.tn}
                </div>
                <div className="text-[11px] text-slate-400">True Negative</div>
              </div>
              <div className="border border-slate-800 rounded-md p-2.5 bg-[#0F172A] text-center">
                <div className="font-mono text-lg font-semibold tabular-nums text-slate-300">
                  {thresholdMetrics.fp}
                </div>
                <div className="text-[11px] text-slate-400">False Positive</div>
              </div>

              <div className="flex items-center font-medium text-slate-300 pr-2">
                Actual: Delayed
              </div>
              <div className="border border-rose-500/30 rounded-md p-2.5 bg-rose-500/10 text-center">
                <div className="font-mono text-lg font-semibold tabular-nums text-rose-300">
                  {thresholdMetrics.fn}
                </div>
                <div className="text-[11px] text-slate-400">
                  Missed Delay (FN)
                </div>
              </div>
              <div className="border border-blue-500/30 rounded-md p-2.5 bg-blue-500/10 text-center">
                <div className="font-mono text-lg font-semibold tabular-nums text-blue-300">
                  {thresholdMetrics.tp}
                </div>
                <div className="text-[11px] text-slate-400">True Positive</div>
              </div>
            </div>
          </section>
        </div>
      )}

      {/* TAB 3: Bias-Variance Learning Curve, Permutation Importance, and Cohort Breakdowns */}
      {activeTab === 'diagnostics' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Learning Curve */}
            <section
              aria-label="Bias-Variance Learning Curve"
              className="lg:col-span-5 bg-[#162032] border border-slate-800 rounded-lg p-5 space-y-4"
            >
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-display text-sm font-semibold text-slate-100">
                  Learning Curve (Generalization)
                </h2>
                <span className="font-mono text-xs text-teal-400">
                  Gap:{' '}
                  {(
                    (evaluationSuite.learningCurve[
                      evaluationSuite.learningCurve.length - 1
                    ].trainAuc -
                      evaluationSuite.learningCurve[
                        evaluationSuite.learningCurve.length - 1
                      ].valAuc) *
                    100
                  ).toFixed(1)}{' '}
                  pp
                </span>
              </div>

              <svg
                viewBox="0 0 320 210"
                className="w-full max-w-md mx-auto overflow-visible"
                role="img"
                aria-label="Training vs validation learning curve"
              >
                {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
                  const aucVal = minLcAuc + frac * (1 - minLcAuc);
                  return (
                    <g key={frac}>
                      <line
                        x1={padL}
                        y1={toY(frac)}
                        x2={padL + plotW}
                        y2={toY(frac)}
                        stroke="#1E293B"
                        strokeWidth="1"
                      />
                      <text
                        x={padL - 6}
                        y={toY(frac) + 3}
                        textAnchor="end"
                        className="fill-slate-400 font-mono text-[8px]"
                      >
                        {aucVal.toFixed(2)}
                      </text>
                    </g>
                  );
                })}

                {evaluationSuite.learningCurve.map((pt) => {
                  const xNorm =
                    pt.trainSize / evaluationSuite.trainCount;
                  return (
                    <text
                      key={pt.trainSize}
                      x={toX(xNorm)}
                      y={padT + plotH + 12}
                      textAnchor="middle"
                      className="fill-slate-400 font-mono text-[8px]"
                    >
                      {pt.trainSize}
                    </text>
                  );
                })}

                {/* Train AUC */}
                <path
                  d={evaluationSuite.learningCurve
                    .map((pt, idx) => {
                      const xNorm = pt.trainSize / evaluationSuite.trainCount;
                      const yNorm =
                        (pt.trainAuc - minLcAuc) / Math.max(0.01, 1 - minLcAuc);
                      return `${idx === 0 ? 'M' : 'L'} ${toX(xNorm).toFixed(1)} ${toY(clamp01(yNorm)).toFixed(1)}`;
                    })
                    .join(' ')}
                  fill="none"
                  stroke="#94A3B8"
                  strokeWidth="1.8"
                  strokeDasharray="4 2"
                />

                {/* Validation AUC */}
                <path
                  d={evaluationSuite.learningCurve
                    .map((pt, idx) => {
                      const xNorm = pt.trainSize / evaluationSuite.trainCount;
                      const yNorm =
                        (pt.valAuc - minLcAuc) / Math.max(0.01, 1 - minLcAuc);
                      return `${idx === 0 ? 'M' : 'L'} ${toX(xNorm).toFixed(1)} ${toY(clamp01(yNorm)).toFixed(1)}`;
                    })
                    .join(' ')}
                  fill="none"
                  stroke="#2DD4BF"
                  strokeWidth="2.2"
                />

                <text
                  x={padL + plotW / 2}
                  y={205}
                  textAnchor="middle"
                  className="fill-slate-400 text-[9px] font-medium"
                >
                  Training Sample Size
                </text>
                <text
                  x={10}
                  y={padT + plotH / 2}
                  textAnchor="middle"
                  transform={`rotate(-90 10 ${padT + plotH / 2})`}
                  className="fill-slate-400 text-[9px] font-medium"
                >
                  ROC-AUC Score
                </text>
              </svg>

              <div className="flex items-center justify-between pt-2 border-t border-slate-800 text-xs text-slate-300">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-xs bg-teal-400 inline-block" />
                  Validation AUC
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-xs bg-slate-400 inline-block" />
                  Training AUC
                </span>
              </div>
            </section>

            {/* Permutation Feature Importance */}
            <section
              aria-label="Permutation Feature Importance"
              className="lg:col-span-7 bg-[#162032] border border-slate-800 rounded-lg p-5 space-y-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-display text-sm font-semibold text-slate-100">
                  Permutation Importance (Hold-Out ΔROC-AUC)
                </h2>
                <span className="text-xs text-slate-400">
                  Includes 3 engineered interaction features
                </span>
              </div>

              <div className="space-y-2.5">
                {evaluationSuite.permutationImportance
                  .slice(0, 10)
                  .map((item) => {
                    const pct = Math.min(
                      100,
                      (item.aucDrop / maxPermDrop) * 100
                    );
                    const isEng = item.category === 'Engineered';
                    return (
                      <div key={item.feature} className="space-y-1">
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <span className="font-medium text-slate-200 truncate">
                            {item.feature}
                            {isEng && (
                              <span className="ml-2 font-mono text-[10px] uppercase tracking-wider text-blue-400">
                                Engineered
                              </span>
                            )}
                          </span>
                          <span className="font-mono tabular-nums text-slate-300 shrink-0">
                            −{item.aucDrop.toFixed(4)}
                          </span>
                        </div>
                        <div className="h-2 w-full rounded-xs bg-[#0F172A] overflow-hidden">
                          <div
                            className={`h-full transition-all duration-300 ${
                              isEng ? 'bg-blue-400' : 'bg-teal-400'
                            }`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
              </div>
            </section>
          </div>

          {stats.totalProjects > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <BreakdownBars
                title="Delay Rate by Active Litigations"
                items={stats.byLitigations}
              />
              <BreakdownBars
                title="Delay Rate by Environmental Clearance"
                items={stats.byClearance}
              />
              <BreakdownBars
                title="Delay Rate by State"
                items={stats.byRegion}
              />
              <BreakdownBars
                title="Delay Rate by Corridor Type"
                items={stats.byProjectType}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}
