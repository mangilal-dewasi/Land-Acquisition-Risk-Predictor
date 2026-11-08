export type ProjectType =
  | 'Highway'
  | 'Railway'
  | 'Industrial Corridor'
  | 'Rural Road';

export type IndianState =
  | 'Maharashtra'
  | 'Madhya Pradesh'
  | 'Uttar Pradesh'
  | 'Karnataka'
  | 'Gujarat'
  | 'Odisha';

export type ClearanceStatus = 'Approved' | 'Pending' | 'Under Review';

export type RiskTier = 'Low Risk / On Track' | 'Moderate Watch' | 'Critical Risk';

export type ActiveView =
  | 'assessment'
  | 'comparison'
  | 'explainability'
  | 'registry'
  | 'validation';

export interface ProjectParameters {
  project_type: ProjectType;
  region: IndianState;
  region_size_hectares: number;
  affected_families_count: number;
  compensation_disputed_flag: 0 | 1;
  environmental_clearance_status: ClearanceStatus;
  litigations_count: number;
  public_hearing_completed: 0 | 1;
  rehabilitation_progress_pct: number;
  bureaucratic_delay_days: number;
}

export interface ProjectRecord extends ProjectParameters {
  project_id: string;
  target_delayed: 0 | 1;
}

export interface EngineeredFeatures {
  displacementDensity: number; // families per hectare
  legalFrictionIndex: number; // litigations * disputed_flag
  statutoryGapScore: number; // clearance penalty + missing public hearing (0-3)
}

export interface ShapContribution {
  key: keyof ProjectParameters;
  label: string;
  displayValue: string;
  impactPct: number;
  rawLogOdds: number;
  direction: 'risk' | 'mitigation' | 'neutral';
}

export interface RecommendationItem {
  id: string;
  title: string;
  authority: string;
  horizon: string;
  priority: 'Immediate' | 'Targeted' | 'Standard';
  action: string;
}

export interface CohortStats {
  matchedCount: number;
  delayedCount: number;
  historicalDelayRatePct: number;
  scopeLabel: string;
  avgLitigations: number;
  avgRehabPct: number;
}

export interface DelayForecast {
  expectedDelayDays: number;
  rangeMinDays: number;
  rangeMaxDays: number;
  severityLabel: 'Minimal Slippage' | 'Moderate Slippage' | 'Severe Overrun';
}

export interface PredictionResult {
  probabilityPct: number;
  predictedDelayed: 0 | 1;
  riskTier: RiskTier;
  primaryDriver: string;
  secondaryDriver: string;
  baseProbabilityPct: number;
  delayScore: number;
  engineered: EngineeredFeatures;
  delayForecast: DelayForecast;
  shapContributions: ShapContribution[];
  recommendations: RecommendationItem[];
  cohortStats: CohortStats;
}

export interface CategoryBreakdown {
  label: string;
  total: number;
  delayed: number;
  delayRatePct: number;
}

export interface DatasetStats {
  totalProjects: number;
  delayedProjects: number;
  onTrackProjects: number;
  overallDelayRatePct: number;
  avgLitigations: number;
  avgBureaucraticDays: number;
  avgRehabPct: number;
  byRegion: CategoryBreakdown[];
  byProjectType: CategoryBreakdown[];
  byClearance: CategoryBreakdown[];
  byLitigations: CategoryBreakdown[];
}

export interface SavedScenario {
  id: string;
  name: string;
  savedAt: string;
  parameters: ProjectParameters;
  probabilityPct: number;
  riskTier: RiskTier;
  primaryDriver: string;
}

export type SupervisedModelId =
  | 'logistic'
  | 'random_forest'
  | 'gradient_boosting'
  | 'calibrated_gbm';

export interface RocPoint {
  fpr: number;
  tpr: number;
}

export interface PrPoint {
  recall: number;
  precision: number;
  threshold: number;
  f1: number;
  f2: number;
}

export interface CalibrationBin {
  binLabel: string;
  meanPredictedUncalibrated: number;
  meanPredictedCalibrated: number;
  empiricalFraction: number;
  count: number;
}

export interface ModelBenchmarkResult {
  id: SupervisedModelId;
  name: string;
  family: string;
  accuracy: number;
  precision: number;
  recall: number;
  f1: number;
  f2: number;
  rocAuc: number;
  prAuc: number;
  brierScore: number;
  rocCurve: RocPoint[];
  testProbas: number[];
}

export interface LearningCurvePoint {
  trainSize: number;
  trainAuc: number;
  valAuc: number;
}

export interface PermutationImportanceItem {
  feature: string;
  category: 'Base' | 'Engineered';
  aucDrop: number;
  stdDrop: number;
}

export interface RegressionBenchmark {
  modelName: string;
  maeDays: number;
  rmseDays: number;
  r2Score: number;
  targetDescription: string;
}

export interface SupervisedEvaluationSuite {
  trainCount: number;
  testCount: number;
  featureCount: number;
  yTest: number[];
  models: ModelBenchmarkResult[];
  calibrationBins: CalibrationBin[];
  uncalibratedBrier: number;
  calibratedBrier: number;
  prCurve: PrPoint[];
  f2OptimalThreshold: number;
  f1OptimalThreshold: number;
  learningCurve: LearningCurvePoint[];
  permutationImportance: PermutationImportanceItem[];
  regressionBenchmark: RegressionBenchmark;
}
