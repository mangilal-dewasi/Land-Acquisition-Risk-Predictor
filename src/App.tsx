import { useCallback, useEffect, useMemo, useState } from 'react';
import ExplainabilityView from './components/ExplainabilityView';
import ModelValidationView from './components/ModelValidationView';
import ProjectRegistryView from './components/ProjectRegistryView';
import RiskAssessmentView from './components/RiskAssessmentView';
import ScenarioComparisonView from './components/ScenarioComparisonView';
import Sidebar from './components/Sidebar';
import TopBar from './components/TopBar';
import type {
  ActiveView,
  DelayForecast,
  EngineeredFeatures,
  PredictionResult,
  ProjectParameters,
  ProjectRecord,
  RiskTier,
  SavedScenario,
  ShapContribution,
  SupervisedEvaluationSuite,
} from './types/project';
import {
  computeDatasetStats,
  DEFAULT_PARAMETERS,
  parseCsvDataset,
  predictProjectRisk,
  PRESET_SCENARIOS,
} from './utils/riskEngine';
import { runSupervisedEvaluationSuite } from './utils/supervisedModels';

interface BackendPredictionPatch {
  probabilityPct: number;
  predictedDelayed: 0 | 1;
  riskTier: RiskTier;
  engineered: EngineeredFeatures;
  delayForecast: DelayForecast;
  shapContributions: ShapContribution[];
}

const DATASET_URL = '/data/land_acquisition_projects_4f49d043.csv';

function buildInitialScenarios(): SavedScenario[] {
  const baselineParams = { ...DEFAULT_PARAMETERS };
  const criticalParams = { ...PRESET_SCENARIOS[2].parameters };

  const baselinePred = predictProjectRisk(baselineParams, []);
  const criticalPred = predictProjectRisk(criticalParams, []);

  return [
    {
      id: 'seed-baseline',
      name: 'Highway · Maharashtra (Baseline)',
      savedAt: 'Default',
      parameters: baselineParams,
      probabilityPct: baselinePred.probabilityPct,
      riskTier: baselinePred.riskTier,
      primaryDriver: baselinePred.primaryDriver,
    },
    {
      id: 'seed-critical',
      name: 'Industrial Corridor · Odisha (High Risk)',
      savedAt: 'Reference',
      parameters: criticalParams,
      probabilityPct: criticalPred.probabilityPct,
      riskTier: criticalPred.riskTier,
      primaryDriver: criticalPred.primaryDriver,
    },
  ];
}

export default function App() {
  const [activeView, setActiveView] = useState<ActiveView>('assessment');
  const [parameters, setParameters] = useState<ProjectParameters>(() => ({
    ...DEFAULT_PARAMETERS,
  }));
  const [records, setRecords] = useState<ProjectRecord[]>([]);
  const [loadingDataset, setLoadingDataset] = useState<boolean>(true);
  const [datasetError, setDatasetError] = useState<string | null>(null);
  const [savedScenarios, setSavedScenarios] = useState<SavedScenario[]>(() =>
    buildInitialScenarios()
  );
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [exportSuccess, setExportSuccess] = useState(false);
  const [backendEvaluation, setBackendEvaluation] =
    useState<SupervisedEvaluationSuite | null>(null);
  const [backendPrediction, setBackendPrediction] = useState<{
    paramsKey: string;
    data: BackendPredictionPatch;
  } | null>(null);

  const loadDataset = useCallback(async () => {
    setLoadingDataset(true);
    setDatasetError(null);
    try {
      const response = await fetch(DATASET_URL);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} while loading dataset`);
      }
      const csvText = await response.text();
      const parsed = parseCsvDataset(csvText);
      if (parsed.length === 0) {
        throw new Error('Dataset parsed with zero valid project records.');
      }
      setRecords(parsed);
    } catch (err) {
      setDatasetError(
        err instanceof Error
          ? err.message
          : 'Failed to load historical project registry.'
      );
    } finally {
      setLoadingDataset(false);
    }
  }, []);

  useEffect(() => {
    void loadDataset();
  }, [loadDataset]);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/evaluation', { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: SupervisedEvaluationSuite | null) => {
        if (data && Array.isArray(data.models) && data.models.length > 0) {
          setBackendEvaluation(data);
        }
      })
      .catch(() => {
        // Offline / static-only mode falls back silently to client-side TypeScript engine
      });
    return () => controller.abort();
  }, []);

  const currentParamsKey = useMemo(
    () => JSON.stringify(parameters),
    [parameters]
  );

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      fetch('/api/predict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: currentParamsKey,
        signal: controller.signal,
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((data: BackendPredictionPatch | null) => {
          if (data && typeof data.probabilityPct === 'number') {
            setBackendPrediction({ paramsKey: currentParamsKey, data });
          }
        })
        .catch(() => {
          // Offline / static-only mode uses client-side TypeScript inference
        });
    }, 80);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [currentParamsKey]);

  const prediction = useMemo<PredictionResult>(() => {
    const local = predictProjectRisk(parameters, records);
    if (!backendPrediction || backendPrediction.paramsKey !== currentParamsKey) {
      return local;
    }
    const patch = backendPrediction.data;
    const positiveDrivers = patch.shapContributions.filter(
      (c) => c.impactPct > 0
    );
    const primaryDriver =
      positiveDrivers[0]?.label ??
      patch.shapContributions[0]?.label ??
      local.primaryDriver;
    const secondaryDriver =
      positiveDrivers[1]?.label ??
      patch.shapContributions[1]?.label ??
      local.secondaryDriver;

    return {
      ...local,
      probabilityPct: patch.probabilityPct,
      predictedDelayed: patch.predictedDelayed,
      riskTier: patch.riskTier,
      engineered: patch.engineered,
      delayForecast: patch.delayForecast,
      shapContributions: patch.shapContributions,
      primaryDriver,
      secondaryDriver,
    };
  }, [parameters, records, backendPrediction, currentParamsKey]);

  const datasetStats = useMemo(
    () => computeDatasetStats(records),
    [records]
  );

  const evaluationSuite = useMemo(
    () => backendEvaluation ?? runSupervisedEvaluationSuite(records),
    [backendEvaluation, records]
  );

  const handleSaveScenario = (customName?: string) => {
    const nextNumber = savedScenarios.length + 1;
    const timestamp = new Date().toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
    const fallbackName = `${parameters.project_type} · ${parameters.region} #${nextNumber}`;
    const entry: SavedScenario = {
      id: `sc-${Date.now()}`,
      name: customName || fallbackName,
      savedAt: timestamp,
      parameters: { ...parameters },
      probabilityPct: prediction.probabilityPct,
      riskTier: prediction.riskTier,
      primaryDriver: prediction.primaryDriver,
    };
    setSavedScenarios((prev) => [entry, ...prev].slice(0, 12));
  };

  const handleLoadSamplePair = () => {
    setSavedScenarios(buildInitialScenarios());
  };

  const handleLoadScenario = (scenario: SavedScenario) => {
    setParameters({ ...scenario.parameters });
    setActiveView('assessment');
  };

  const handleDeleteScenario = (id: string) => {
    setSavedScenarios((prev) => prev.filter((item) => item.id !== id));
  };

  const handleResetDefaults = () => {
    setParameters({ ...DEFAULT_PARAMETERS });
  };

  const handleExportReport = () => {
    const payload = {
      generatedAt: new Date().toISOString(),
      project: 'SIH26017 Land Acquisition Risk Predictor',
      parameters,
      engineered_features: prediction.engineered,
      assessment: {
        delay_probability_pct: prediction.probabilityPct,
        predicted_delayed: prediction.predictedDelayed,
        risk_tier: prediction.riskTier,
        expected_delay_days: prediction.delayForecast.expectedDelayDays,
        delay_days_range: [
          prediction.delayForecast.rangeMinDays,
          prediction.delayForecast.rangeMaxDays,
        ],
        primary_driver: prediction.primaryDriver,
        secondary_driver: prediction.secondaryDriver,
        composite_delay_score: prediction.delayScore,
      },
      cohort_benchmark: prediction.cohortStats,
      shap_attributions: prediction.shapContributions,
      mitigation_plan: prediction.recommendations,
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `risk-assessment-${parameters.region.toLowerCase().replace(/\s+/g, '-')}.json`;
    link.click();
    URL.revokeObjectURL(url);

    setExportSuccess(true);
    window.setTimeout(() => setExportSuccess(false), 1800);
  };

  const handleAnalyzeRecord = (recordParams: ProjectParameters) => {
    setParameters(recordParams);
    setActiveView('assessment');
  };

  return (
    <div className="min-h-screen bg-[#0F172A] text-slate-100 flex">
      <Sidebar
        activeView={activeView}
        onSelectView={setActiveView}
        totalProjects={records.length}
        savedCount={savedScenarios.length}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />

      <div className="flex-1 min-w-0 flex flex-col">
        <TopBar
          activeView={activeView}
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
          onResetDefaults={handleResetDefaults}
          onExportReport={handleExportReport}
          exportSuccess={exportSuccess}
        />

        <main className="flex-1 p-4 sm:p-6 max-w-[1440px] w-full mx-auto">
          {activeView === 'assessment' && (
            <RiskAssessmentView
              parameters={parameters}
              prediction={prediction}
              records={records}
              savedScenarios={savedScenarios}
              onChangeParameters={setParameters}
              onSaveScenario={handleSaveScenario}
              onLoadScenario={handleLoadScenario}
              onDeleteScenario={handleDeleteScenario}
              onNavigateView={setActiveView}
            />
          )}

          {activeView === 'comparison' && (
            <ScenarioComparisonView
              savedScenarios={savedScenarios}
              records={records}
              onSaveCurrentToScenarios={handleSaveScenario}
              onLoadSamplePair={handleLoadSamplePair}
              onLoadScenarioToWorkbench={handleLoadScenario}
            />
          )}

          {activeView === 'explainability' && (
            <ExplainabilityView
              parameters={parameters}
              prediction={prediction}
              records={records}
              onApplyParameters={(next) => {
                setParameters(next);
                setActiveView('assessment');
              }}
              onNavigateView={setActiveView}
            />
          )}

          {activeView === 'registry' && (
            <ProjectRegistryView
              records={records}
              loading={loadingDataset}
              error={datasetError}
              onRetryLoad={() => void loadDataset()}
              onAnalyzeRecord={handleAnalyzeRecord}
            />
          )}

          {activeView === 'validation' && (
            <ModelValidationView
              stats={datasetStats}
              evaluationSuite={evaluationSuite}
              loading={loadingDataset}
            />
          )}
        </main>
      </div>
    </div>
  );
}
