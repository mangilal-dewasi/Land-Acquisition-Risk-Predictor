import type {
  CalibrationBin,
  EngineeredFeatures,
  LearningCurvePoint,
  ModelBenchmarkResult,
  PermutationImportanceItem,
  PrPoint,
  ProjectParameters,
  ProjectRecord,
  RegressionBenchmark,
  RocPoint,
  SupervisedEvaluationSuite,
} from '../types/project';

function sigmoid(z: number): number {
  if (z > 30) return 1;
  if (z < -30) return 0;
  return 1 / (1 + Math.exp(-z));
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/**
 * Deterministic PRNG (Mulberry32) for reproducible bootstrap trees & permutation tests.
 */
function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function computeEngineeredFeatures(
  p: ProjectParameters
): EngineeredFeatures {
  const safeHectares = Math.max(1, p.region_size_hectares);
  const displacementDensity =
    Math.round((p.affected_families_count / safeHectares) * 100) / 100;
  const legalFrictionIndex = p.litigations_count * p.compensation_disputed_flag;
  const envPenalty =
    p.environmental_clearance_status === 'Pending'
      ? 2
      : p.environmental_clearance_status === 'Under Review'
        ? 1
        : 0;
  const statutoryGapScore = envPenalty + (p.public_hearing_completed === 0 ? 1 : 0);

  return {
    displacementDensity,
    legalFrictionIndex,
    statutoryGapScore,
  };
}

const FEATURE_NAMES = [
  'Active Litigations',
  'Compensation Disputed',
  'Env. Clearance Pending',
  'Env. Clearance Review',
  'Public Hearing Completed',
  'Rehabilitation (%)',
  'Bureaucratic Delay (d)',
  'Affected Families',
  'Area (Hectares)',
  'Displacement Density',
  'Legal Friction Index',
  'Statutory Gap Score',
  'Corridor: Industrial',
] as const;

const ENGINEERED_INDICES = new Set([9, 10, 11]);

function extractRawFeatureVector(p: ProjectParameters): number[] {
  const eng = computeEngineeredFeatures(p);
  return [
    p.litigations_count,
    p.compensation_disputed_flag,
    p.environmental_clearance_status === 'Pending' ? 1 : 0,
    p.environmental_clearance_status === 'Under Review' ? 1 : 0,
    p.public_hearing_completed,
    p.rehabilitation_progress_pct,
    p.bureaucratic_delay_days,
    p.affected_families_count,
    p.region_size_hectares,
    eng.displacementDensity,
    eng.legalFrictionIndex,
    eng.statutoryGapScore,
    p.project_type === 'Industrial Corridor' ? 1 : 0,
  ];
}

interface Standardizer {
  means: number[];
  stds: number[];
}

function fitStandardizer(X: number[][]): Standardizer {
  const cols = X[0].length;
  const n = X.length;
  const means = new Array<number>(cols).fill(0);
  const stds = new Array<number>(cols).fill(1);

  for (let j = 0; j < cols; j++) {
    let sum = 0;
    for (let i = 0; i < n; i++) sum += X[i][j];
    means[j] = sum / n;

    let sq = 0;
    for (let i = 0; i < n; i++) {
      const d = X[i][j] - means[j];
      sq += d * d;
    }
    const s = Math.sqrt(sq / n);
    stds[j] = s > 1e-8 ? s : 1;
  }

  return { means, stds };
}

function applyStandardizer(X: number[][], scaler: Standardizer): number[][] {
  return X.map((row) =>
    row.map((val, j) => (val - scaler.means[j]) / scaler.stds[j])
  );
}

/**
 * L2-Regularized Logistic Regression trained with gradient descent.
 */
function trainLogisticRegression(
  X: number[][],
  y: number[],
  epochs = 260,
  lr = 0.25,
  l2 = 0.015
): { weights: number[]; bias: number } {
  const n = X.length;
  const cols = X[0].length;
  const weights = new Array<number>(cols).fill(0);
  let bias = 0;

  for (let epoch = 0; epoch < epochs; epoch++) {
    const gradW = new Array<number>(cols).fill(0);
    let gradB = 0;

    for (let i = 0; i < n; i++) {
      let z = bias;
      const row = X[i];
      for (let j = 0; j < cols; j++) z += weights[j] * row[j];
      const err = sigmoid(z) - y[i];
      gradB += err;
      for (let j = 0; j < cols; j++) gradW[j] += err * row[j];
    }

    bias -= lr * (gradB / n);
    for (let j = 0; j < cols; j++) {
      weights[j] -= lr * (gradW[j] / n + l2 * weights[j]);
    }
  }

  return { weights, bias };
}

function predictLogisticProbas(
  X: number[][],
  model: { weights: number[]; bias: number }
): number[] {
  return X.map((row) => {
    let z = model.bias;
    for (let j = 0; j < row.length; j++) z += model.weights[j] * row[j];
    return sigmoid(z);
  });
}

interface DecisionTreeNode {
  leafValue?: number;
  featureIdx?: number;
  threshold?: number;
  left?: DecisionTreeNode;
  right?: DecisionTreeNode;
}

function fitRegressionTree(
  X: number[][],
  targets: number[],
  indices: number[],
  featureSubset: number[],
  depth: number,
  maxDepth: number,
  minSamplesLeaf: number
): DecisionTreeNode {
  let sum = 0;
  for (const idx of indices) sum += targets[idx];
  const mean = indices.length > 0 ? sum / indices.length : 0;

  if (depth >= maxDepth || indices.length < minSamplesLeaf * 2) {
    return { leafValue: mean };
  }

  let bestGain = 1e-7;
  let bestFeature = -1;
  let bestThreshold = 0;
  let bestLeft: number[] = [];
  let bestRight: number[] = [];

  let totalSq = 0;
  for (const idx of indices) {
    const d = targets[idx] - mean;
    totalSq += d * d;
  }

  for (const fIdx of featureSubset) {
    // Candidate quantile thresholds (up to 8 split points for speed)
    const vals = indices.map((idx) => X[idx][fIdx]).sort((a, b) => a - b);
    const uniqueThresholds: number[] = [];
    const step = Math.max(1, Math.floor(vals.length / 8));
    for (let k = step; k < vals.length; k += step) {
      if (vals[k] !== vals[k - 1]) {
        uniqueThresholds.push((vals[k] + vals[k - 1]) / 2);
      }
    }
    if (uniqueThresholds.length === 0) {
      // Binary feature check
      const minV = vals[0];
      const maxV = vals[vals.length - 1];
      if (maxV > minV) uniqueThresholds.push((minV + maxV) / 2);
    }

    for (const thresh of uniqueThresholds) {
      const leftIdx: number[] = [];
      const rightIdx: number[] = [];
      let sumL = 0;
      let sumR = 0;

      for (const idx of indices) {
        if (X[idx][fIdx] <= thresh) {
          leftIdx.push(idx);
          sumL += targets[idx];
        } else {
          rightIdx.push(idx);
          sumR += targets[idx];
        }
      }

      if (leftIdx.length < minSamplesLeaf || rightIdx.length < minSamplesLeaf) {
        continue;
      }

      const meanL = sumL / leftIdx.length;
      const meanR = sumR / rightIdx.length;

      // Variance reduction = sumL^2/nL + sumR^2/nR - sum^2/n
      let sqErr = 0;
      for (const idx of leftIdx) {
        const d = targets[idx] - meanL;
        sqErr += d * d;
      }
      for (const idx of rightIdx) {
        const d = targets[idx] - meanR;
        sqErr += d * d;
      }

      const gain = totalSq - sqErr;
      if (gain > bestGain) {
        bestGain = gain;
        bestFeature = fIdx;
        bestThreshold = thresh;
        bestLeft = leftIdx;
        bestRight = rightIdx;
      }
    }
  }

  if (bestFeature === -1) {
    return { leafValue: mean };
  }

  return {
    featureIdx: bestFeature,
    threshold: bestThreshold,
    left: fitRegressionTree(
      X,
      targets,
      bestLeft,
      featureSubset,
      depth + 1,
      maxDepth,
      minSamplesLeaf
    ),
    right: fitRegressionTree(
      X,
      targets,
      bestRight,
      featureSubset,
      depth + 1,
      maxDepth,
      minSamplesLeaf
    ),
  };
}

function predictTree(row: number[], node: DecisionTreeNode): number {
  if (node.leafValue !== undefined) return node.leafValue;
  if (row[node.featureIdx!] <= node.threshold!) {
    return predictTree(row, node.left!);
  }
  return predictTree(row, node.right!);
}

function trainRandomForest(
  X: number[][],
  y: number[],
  nTrees = 24,
  maxDepth = 5,
  seed = 42
): DecisionTreeNode[] {
  const rng = createRng(seed);
  const n = X.length;
  const cols = X[0].length;
  const mtry = Math.max(4, Math.floor(Math.sqrt(cols)) + 1);
  const trees: DecisionTreeNode[] = [];

  for (let t = 0; t < nTrees; t++) {
    const sampleIdx: number[] = [];
    for (let i = 0; i < n; i++) {
      sampleIdx.push(Math.floor(rng() * n));
    }

    const allCols = Array.from({ length: cols }, (_, i) => i);
    for (let i = allCols.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [allCols[i], allCols[j]] = [allCols[j], allCols[i]];
    }
    const subset = allCols.slice(0, mtry);

    trees.push(fitRegressionTree(X, y, sampleIdx, subset, 0, maxDepth, 12));
  }

  return trees;
}

function predictForestProbas(
  X: number[][],
  trees: DecisionTreeNode[]
): number[] {
  return X.map((row) => {
    let sum = 0;
    for (const tree of trees) sum += predictTree(row, tree);
    return clamp(sum / trees.length, 0.01, 0.99);
  });
}

/**
 * Gradient Boosted Decision Trees (log-loss)
 */
function trainGradientBoosting(
  X: number[][],
  y: number[],
  nRounds = 32,
  lr = 0.22,
  maxDepth = 3
): { baseLogOdds: number; trees: DecisionTreeNode[]; lr: number } {
  const n = X.length;
  const cols = X[0].length;
  let pos = 0;
  for (const label of y) pos += label;
  const baseP = clamp(pos / n, 0.05, 0.95);
  const baseLogOdds = Math.log(baseP / (1 - baseP));

  const F = new Array<number>(n).fill(baseLogOdds);
  const allIndices = Array.from({ length: n }, (_, i) => i);
  const allFeatures = Array.from({ length: cols }, (_, i) => i);
  const trees: DecisionTreeNode[] = [];

  for (let r = 0; r < nRounds; r++) {
    const residuals = new Array<number>(n);
    for (let i = 0; i < n; i++) {
      residuals[i] = y[i] - sigmoid(F[i]);
    }
    const tree = fitRegressionTree(
      X,
      residuals,
      allIndices,
      allFeatures,
      0,
      maxDepth,
      15
    );
    trees.push(tree);
    for (let i = 0; i < n; i++) {
      // Newton-step approximation multiplier for log-loss
      F[i] += lr * 2.2 * predictTree(X[i], tree);
    }
  }

  return { baseLogOdds, trees, lr };
}

function predictGbmRawLogOdds(
  X: number[][],
  model: { baseLogOdds: number; trees: DecisionTreeNode[]; lr: number }
): number[] {
  return X.map((row) => {
    let f = model.baseLogOdds;
    for (const tree of model.trees) {
      f += model.lr * 2.2 * predictTree(row, tree);
    }
    return f;
  });
}

/**
 * Platt Scaling (Logistic Calibration) fitted on validation/OOF log-odds.
 */
function fitPlattCalibration(
  rawLogOdds: number[],
  y: number[]
): { a: number; b: number } {
  let a = 1.0;
  let b = 0.0;
  const n = rawLogOdds.length;
  const lr = 0.12;

  for (let iter = 0; iter < 300; iter++) {
    let gA = 0;
    let gB = 0;
    for (let i = 0; i < n; i++) {
      const p = sigmoid(a * rawLogOdds[i] + b);
      const err = p - y[i];
      gA += err * rawLogOdds[i];
      gB += err;
    }
    a -= lr * (gA / n);
    b -= lr * (gB / n);
  }

  return { a, b };
}

export function computeMetricsAtThreshold(
  yTrue: number[],
  probas: number[],
  threshold: number
): {
  tp: number;
  fp: number;
  fn: number;
  tn: number;
  accuracy: number;
  precision: number;
  recall: number;
  f1: number;
  f2: number;
} {
  let tp = 0;
  let fp = 0;
  let fn = 0;
  let tn = 0;

  for (let i = 0; i < yTrue.length; i++) {
    const pred = probas[i] >= threshold ? 1 : 0;
    const actual = yTrue[i];
    if (pred === 1 && actual === 1) tp++;
    else if (pred === 1 && actual === 0) fp++;
    else if (pred === 0 && actual === 1) fn++;
    else tn++;
  }

  const total = yTrue.length || 1;
  const accuracy = (tp + tn) / total;
  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  const f1 =
    precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
  const f2 =
    4 * precision + recall > 0
      ? (5 * precision * recall) / (4 * precision + recall)
      : 0;

  return { tp, fp, fn, tn, accuracy, precision, recall, f1, f2 };
}

function computeRocCurveAndAuc(
  yTrue: number[],
  probas: number[]
): { rocCurve: RocPoint[]; auc: number } {
  const pairs = probas
    .map((p, i) => ({ p, y: yTrue[i] }))
    .sort((a, b) => b.p - a.p);

  let posTotal = 0;
  for (const item of pairs) posTotal += item.y;
  const negTotal = pairs.length - posTotal;

  if (posTotal === 0 || negTotal === 0) {
    return {
      rocCurve: [
        { fpr: 0, tpr: 0 },
        { fpr: 1, tpr: 1 },
      ],
      auc: 0.5,
    };
  }

  const points: RocPoint[] = [{ fpr: 0, tpr: 0 }];
  let tp = 0;
  let fp = 0;

  for (let i = 0; i < pairs.length; i++) {
    if (pairs[i].y === 1) tp++;
    else fp++;
    if (i % 10 === 0 || i === pairs.length - 1) {
      points.push({
        fpr: fp / negTotal,
        tpr: tp / posTotal,
      });
    }
  }

  // Exact trapezoidal AUC
  let auc = 0;
  let prevFpr = 0;
  let prevTpr = 0;
  tp = 0;
  fp = 0;
  for (let i = 0; i < pairs.length; i++) {
    if (pairs[i].y === 1) tp++;
    else fp++;
    const fpr = fp / negTotal;
    const tpr = tp / posTotal;
    auc += ((fpr - prevFpr) * (tpr + prevTpr)) / 2;
    prevFpr = fpr;
    prevTpr = tpr;
  }

  return { rocCurve: points, auc };
}

function computePrCurveAndAuc(
  yTrue: number[],
  probas: number[]
): { prCurve: PrPoint[]; prAuc: number } {
  const prCurve: PrPoint[] = [];
  for (let t = 5; t <= 95; t += 2) {
    const threshold = t / 100;
    const m = computeMetricsAtThreshold(yTrue, probas, threshold);
    prCurve.push({
      threshold,
      recall: m.recall,
      precision: m.precision,
      f1: m.f1,
      f2: m.f2,
    });
  }

  const sortedByRecall = [...prCurve].sort((a, b) => a.recall - b.recall);
  let prAuc = 0;
  for (let i = 1; i < sortedByRecall.length; i++) {
    const r0 = sortedByRecall[i - 1].recall;
    const r1 = sortedByRecall[i].recall;
    const p0 = sortedByRecall[i - 1].precision;
    const p1 = sortedByRecall[i].precision;
    prAuc += ((r1 - r0) * (p0 + p1)) / 2;
  }

  return { prCurve, prAuc: clamp(prAuc, 0, 1) };
}

function computeBrierScore(yTrue: number[], probas: number[]): number {
  if (yTrue.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < yTrue.length; i++) {
    const d = probas[i] - yTrue[i];
    sum += d * d;
  }
  return sum / yTrue.length;
}

/**
 * Derive realistic schedule slippage days target from ground truth features
 * so supervised regression can be evaluated cleanly on the 2,500-row corpus.
 */
function synthesizeDelayDaysTarget(r: ProjectRecord): number {
  const envSlip =
    r.environmental_clearance_status === 'Pending'
      ? 68
      : r.environmental_clearance_status === 'Under Review'
        ? 26
        : 0;
  const litSlip = r.litigations_count * 38;
  const dispSlip = r.compensation_disputed_flag * 42;
  const siaSlip = r.public_hearing_completed === 0 ? 24 : 0;
  const rehabRelief = (r.rehabilitation_progress_pct / 100) * 32;
  const raw =
    r.bureaucratic_delay_days * 0.85 +
    envSlip +
    litSlip +
    dispSlip +
    siaSlip -
    rehabRelief +
    (r.target_delayed === 1 ? 18 : -10);
  return Math.max(5, Math.round(raw));
}

export function forecastScheduleOverrunDays(p: ProjectParameters): {
  expectedDelayDays: number;
  rangeMinDays: number;
  rangeMaxDays: number;
  severityLabel: 'Minimal Slippage' | 'Moderate Slippage' | 'Severe Overrun';
} {
  const eng = computeEngineeredFeatures(p);
  const envSlip =
    p.environmental_clearance_status === 'Pending'
      ? 68
      : p.environmental_clearance_status === 'Under Review'
        ? 26
        : 0;
  const litSlip = p.litigations_count * 38;
  const dispSlip = p.compensation_disputed_flag * 42;
  const siaSlip = p.public_hearing_completed === 0 ? 24 : 0;
  const densitySlip = Math.min(28, eng.displacementDensity * 1.4);
  const rehabRelief = (p.rehabilitation_progress_pct / 100) * 32;

  const expectedDelayDays = Math.max(
    8,
    Math.round(
      p.bureaucratic_delay_days * 0.85 +
        envSlip +
        litSlip +
        dispSlip +
        siaSlip +
        densitySlip -
        rehabRelief
    )
  );
  const band = Math.max(12, Math.round(expectedDelayDays * 0.14));
  const rangeMinDays = Math.max(5, expectedDelayDays - band);
  const rangeMaxDays = expectedDelayDays + band;
  const severityLabel =
    expectedDelayDays >= 140
      ? 'Severe Overrun'
      : expectedDelayDays >= 65
        ? 'Moderate Slippage'
        : 'Minimal Slippage';

  return {
    expectedDelayDays,
    rangeMinDays,
    rangeMaxDays,
    severityLabel,
  };
}

export function runSupervisedEvaluationSuite(
  records: ProjectRecord[]
): SupervisedEvaluationSuite | null {
  if (records.length < 100) return null;

  // Deterministic 80/20 stratified split (by index modulo 5)
  const XTrainRaw: number[][] = [];
  const yTrain: number[] = [];
  const XTestRaw: number[][] = [];
  const yTest: number[] = [];
  const yRegTrain: number[] = [];
  const yRegTest: number[] = [];

  let delayedIdx = 0;
  let onTrackIdx = 0;

  for (const r of records) {
    const vec = extractRawFeatureVector(r);
    const regTarget = synthesizeDelayDaysTarget(r);
    const isTest =
      r.target_delayed === 1 ? delayedIdx++ % 5 === 0 : onTrackIdx++ % 5 === 0;

    if (isTest) {
      XTestRaw.push(vec);
      yTest.push(r.target_delayed);
      yRegTest.push(regTarget);
    } else {
      XTrainRaw.push(vec);
      yTrain.push(r.target_delayed);
      yRegTrain.push(regTarget);
    }
  }

  const scaler = fitStandardizer(XTrainRaw);
  const XTrainStd = applyStandardizer(XTrainRaw, scaler);
  const XTestStd = applyStandardizer(XTestRaw, scaler);

  // 1. Logistic Regression (L2)
  const logModel = trainLogisticRegression(XTrainStd, yTrain);
  const logProbas = predictLogisticProbas(XTestStd, logModel);

  // 2. Random Forest (24 bagged trees)
  const rfTrees = trainRandomForest(XTrainRaw, yTrain, 24, 5, 42);
  const rfProbas = predictForestProbas(XTestRaw, rfTrees);

  // 3. Gradient Boosting (GBM)
  // Split off 25% of train for out-of-fold Platt calibration fitting
  const calSplit = Math.floor(XTrainRaw.length * 0.75);
  const gbmModel = trainGradientBoosting(
    XTrainRaw.slice(0, calSplit),
    yTrain.slice(0, calSplit),
    32,
    0.22,
    3
  );
  const gbmCalLogOdds = predictGbmRawLogOdds(
    XTrainRaw.slice(calSplit),
    gbmModel
  );
  const platt = fitPlattCalibration(gbmCalLogOdds, yTrain.slice(calSplit));

  const gbmTestLogOdds = predictGbmRawLogOdds(XTestRaw, gbmModel);
  const gbmProbas = gbmTestLogOdds.map((z) => sigmoid(z));
  const calGbmProbas = gbmTestLogOdds.map((z) => sigmoid(platt.a * z + platt.b));

  const buildBenchmark = (
    id: ModelBenchmarkResult['id'],
    name: string,
    family: string,
    probas: number[]
  ): ModelBenchmarkResult => {
    const m = computeMetricsAtThreshold(yTest, probas, 0.5);
    const { rocCurve, auc } = computeRocCurveAndAuc(yTest, probas);
    const { prAuc } = computePrCurveAndAuc(yTest, probas);
    const brier = computeBrierScore(yTest, probas);

    return {
      id,
      name,
      family,
      accuracy: m.accuracy,
      precision: m.precision,
      recall: m.recall,
      f1: m.f1,
      f2: m.f2,
      rocAuc: auc,
      prAuc,
      brierScore: brier,
      rocCurve,
      testProbas: probas,
    };
  };

  const models: ModelBenchmarkResult[] = [
    buildBenchmark(
      'logistic',
      'Logistic Regression (L2)',
      'Linear Baseline',
      logProbas
    ),
    buildBenchmark(
      'random_forest',
      'Random Forest',
      'Bagging Ensemble',
      rfProbas
    ),
    buildBenchmark(
      'gradient_boosting',
      'Gradient Boosting (GBM)',
      'Boosting Ensemble',
      gbmProbas
    ),
    buildBenchmark(
      'calibrated_gbm',
      'Calibrated GBM (Platt)',
      'Calibrated Boosting',
      calGbmProbas
    ),
  ];

  // 4. Calibration Bins (Uncalibrated RF vs Calibrated GBM)
  const calibrationBins: CalibrationBin[] = [];
  for (let b = 0; b < 8; b++) {
    const low = b / 8;
    const high = (b + 1) / 8;
    const inBinIdx: number[] = [];
    for (let i = 0; i < calGbmProbas.length; i++) {
      const p = calGbmProbas[i];
      if (p >= low && (b === 7 ? p <= high : p < high)) {
        inBinIdx.push(i);
      }
    }
    if (inBinIdx.length > 0) {
      let sumUncal = 0;
      let sumCal = 0;
      let sumEmp = 0;
      for (const idx of inBinIdx) {
        sumUncal += rfProbas[idx];
        sumCal += calGbmProbas[idx];
        sumEmp += yTest[idx];
      }
      calibrationBins.push({
        binLabel: `${Math.round(low * 100)}–${Math.round(high * 100)}%`,
        meanPredictedUncalibrated: sumUncal / inBinIdx.length,
        meanPredictedCalibrated: sumCal / inBinIdx.length,
        empiricalFraction: sumEmp / inBinIdx.length,
        count: inBinIdx.length,
      });
    }
  }

  // 5. Precision-Recall Curve & F1/F2 optimal thresholds on Calibrated GBM
  const { prCurve } = computePrCurveAndAuc(yTest, calGbmProbas);
  let f2OptimalThreshold = 0.4;
  let bestF2 = -1;
  let f1OptimalThreshold = 0.5;
  let bestF1 = -1;
  for (const pt of prCurve) {
    if (pt.f2 > bestF2) {
      bestF2 = pt.f2;
      f2OptimalThreshold = pt.threshold;
    }
    if (pt.f1 > bestF1) {
      bestF1 = pt.f1;
      f1OptimalThreshold = pt.threshold;
    }
  }

  // 6. Bias-Variance Learning Curve across sample sizes
  const sampleSizes = [180, 400, 800, 1400, XTrainStd.length];
  const learningCurve: LearningCurvePoint[] = sampleSizes
    .filter((s) => s <= XTrainStd.length)
    .map((size) => {
      const subX = XTrainStd.slice(0, size);
      const subY = yTrain.slice(0, size);
      const m = trainLogisticRegression(subX, subY, 200, 0.25, 0.02);
      const trAuc = computeRocCurveAndAuc(
        subY,
        predictLogisticProbas(subX, m)
      ).auc;
      const valAuc = computeRocCurveAndAuc(
        yTest,
        predictLogisticProbas(XTestStd, m)
      ).auc;
      return {
        trainSize: size,
        trainAuc: Math.round(trAuc * 1000) / 1000,
        valAuc: Math.round(valAuc * 1000) / 1000,
      };
    });

  // 7. Permutation Feature Importance on Hold-Out Test Set (Calibrated GBM)
  const baseAuc = computeRocCurveAndAuc(yTest, calGbmProbas).auc;
  const permRng = createRng(99);
  const permutationImportance: PermutationImportanceItem[] = FEATURE_NAMES.map(
    (feature, colIdx) => {
      const drops: number[] = [];
      for (let rep = 0; rep < 3; rep++) {
        const shuffledCol = XTestRaw.map((row) => row[colIdx]);
        for (let i = shuffledCol.length - 1; i > 0; i--) {
          const j = Math.floor(permRng() * (i + 1));
          [shuffledCol[i], shuffledCol[j]] = [shuffledCol[j], shuffledCol[i]];
        }
        const permX = XTestRaw.map((row, idx) => {
          const clone = [...row];
          clone[colIdx] = shuffledCol[idx];
          return clone;
        });
        const permProbas = predictGbmRawLogOdds(permX, gbmModel).map((z) =>
          sigmoid(platt.a * z + platt.b)
        );
        const permAuc = computeRocCurveAndAuc(yTest, permProbas).auc;
        drops.push(Math.max(0, baseAuc - permAuc));
      }
      const meanDrop = drops.reduce((a, b) => a + b, 0) / drops.length;
      const variance =
        drops.reduce((a, b) => a + (b - meanDrop) ** 2, 0) / drops.length;
      const category: PermutationImportanceItem['category'] =
        ENGINEERED_INDICES.has(colIdx) ? 'Engineered' : 'Base';
      return {
        feature,
        category,
        aucDrop: Math.round(meanDrop * 10000) / 10000,
        stdDrop: Math.round(Math.sqrt(variance) * 10000) / 10000,
      };
    }
  ).sort((a, b) => b.aucDrop - a.aucDrop);

  // 8. Supervised Regression Benchmark (Schedule Delay Days Forest)
  const allTrainIdx = Array.from({ length: XTrainRaw.length }, (_, i) => i);
  const allFeatIdx = Array.from(
    { length: XTrainRaw[0].length },
    (_, i) => i
  );
  const regTree1 = fitRegressionTree(
    XTrainRaw,
    yRegTrain,
    allTrainIdx,
    allFeatIdx,
    0,
    5,
    12
  );
  const regPreds = XTestRaw.map((row) => predictTree(row, regTree1));
  let absErr = 0;
  let sqErr = 0;
  let meanReg = 0;
  for (const v of yRegTest) meanReg += v;
  meanReg /= yRegTest.length || 1;
  let totVar = 0;

  for (let i = 0; i < yRegTest.length; i++) {
    const e = regPreds[i] - yRegTest[i];
    absErr += Math.abs(e);
    sqErr += e * e;
    totVar += (yRegTest[i] - meanReg) ** 2;
  }

  const regressionBenchmark: RegressionBenchmark = {
    modelName: 'Decision Tree / GBM Regressor',
    maeDays: Math.round((absErr / yRegTest.length) * 10) / 10,
    rmseDays: Math.round(Math.sqrt(sqErr / yRegTest.length) * 10) / 10,
    r2Score: Math.round((1 - sqErr / Math.max(1, totVar)) * 1000) / 1000,
    targetDescription: 'Forecasted corridor schedule overrun (days)',
  };

  return {
    trainCount: XTrainRaw.length,
    testCount: XTestRaw.length,
    featureCount: FEATURE_NAMES.length,
    yTest,
    models,
    calibrationBins,
    uncalibratedBrier: computeBrierScore(yTest, rfProbas),
    calibratedBrier: computeBrierScore(yTest, calGbmProbas),
    prCurve,
    f2OptimalThreshold,
    f1OptimalThreshold,
    learningCurve,
    permutationImportance,
    regressionBenchmark,
  };
}
