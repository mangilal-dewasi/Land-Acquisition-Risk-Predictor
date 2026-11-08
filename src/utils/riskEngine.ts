import type {
  CategoryBreakdown,
  ClearanceStatus,
  CohortStats,
  DatasetStats,
  IndianState,
  PredictionResult,
  ProjectParameters,
  ProjectRecord,
  ProjectType,
  RecommendationItem,
  RiskTier,
  ShapContribution,
} from '../types/project';
import {
  computeEngineeredFeatures,
  forecastScheduleOverrunDays,
} from './supervisedModels';

export const PROJECT_TYPES: ProjectType[] = [
  'Highway',
  'Railway',
  'Industrial Corridor',
  'Rural Road',
];

export const INDIAN_STATES: IndianState[] = [
  'Maharashtra',
  'Madhya Pradesh',
  'Uttar Pradesh',
  'Karnataka',
  'Gujarat',
  'Odisha',
];

export const CLEARANCE_STATUSES: ClearanceStatus[] = [
  'Approved',
  'Under Review',
  'Pending',
];

export const DEFAULT_PARAMETERS: ProjectParameters = {
  project_type: 'Highway',
  region: 'Maharashtra',
  region_size_hectares: 150,
  affected_families_count: 450,
  compensation_disputed_flag: 0,
  environmental_clearance_status: 'Approved',
  litigations_count: 1,
  public_hearing_completed: 1,
  rehabilitation_progress_pct: 65,
  bureaucratic_delay_days: 30,
};

export interface PresetScenario {
  id: string;
  label: string;
  parameters: ProjectParameters;
}

export const PRESET_SCENARIOS: PresetScenario[] = [
  {
    id: 'on-track',
    label: 'On-Track Corridor',
    parameters: {
      project_type: 'Highway',
      region: 'Gujarat',
      region_size_hectares: 95,
      affected_families_count: 220,
      compensation_disputed_flag: 0,
      environmental_clearance_status: 'Approved',
      litigations_count: 0,
      public_hearing_completed: 1,
      rehabilitation_progress_pct: 84,
      bureaucratic_delay_days: 18,
    },
  },
  {
    id: 'watch',
    label: 'Moderate Watch',
    parameters: {
      project_type: 'Railway',
      region: 'Madhya Pradesh',
      region_size_hectares: 185,
      affected_families_count: 680,
      compensation_disputed_flag: 0,
      environmental_clearance_status: 'Under Review',
      litigations_count: 1,
      public_hearing_completed: 1,
      rehabilitation_progress_pct: 52,
      bureaucratic_delay_days: 65,
    },
  },
  {
    id: 'critical',
    label: 'Critical Bottleneck',
    parameters: {
      project_type: 'Industrial Corridor',
      region: 'Odisha',
      region_size_hectares: 340,
      affected_families_count: 1450,
      compensation_disputed_flag: 1,
      environmental_clearance_status: 'Pending',
      litigations_count: 3,
      public_hearing_completed: 0,
      rehabilitation_progress_pct: 22,
      bureaucratic_delay_days: 145,
    },
  },
];

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function sigmoid(z: number): number {
  return 1 / (1 + Math.exp(-z));
}

export function parseCsvDataset(csvText: string): ProjectRecord[] {
  const lines = csvText.trim().split(/\r?\n/);
  if (lines.length < 2) return [];

  const records: ProjectRecord[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cols = line.split(',');
    if (cols.length < 12) continue;

    const project_id = cols[0].trim();
    const project_type = cols[1].trim() as ProjectType;
    const region = cols[2].trim() as IndianState;
    const region_size_hectares = Number.parseFloat(cols[3]);
    const affected_families_count = Number.parseInt(cols[4], 10);
    const compensation_disputed_flag = (Number.parseInt(cols[5], 10) === 1 ? 1 : 0) as 0 | 1;
    const environmental_clearance_status = cols[6].trim() as ClearanceStatus;
    const litigations_count = Number.parseInt(cols[7], 10);
    const public_hearing_completed = (Number.parseInt(cols[8], 10) === 1 ? 1 : 0) as 0 | 1;
    const rehabilitation_progress_pct = Number.parseFloat(cols[9]);
    const bureaucratic_delay_days = Number.parseFloat(cols[10]);
    const target_delayed = (Number.parseInt(cols[11], 10) === 1 ? 1 : 0) as 0 | 1;

    if (
      Number.isNaN(region_size_hectares) ||
      Number.isNaN(affected_families_count) ||
      Number.isNaN(litigations_count)
    ) {
      continue;
    }

    records.push({
      project_id,
      project_type,
      region,
      region_size_hectares: Math.round(region_size_hectares * 10) / 10,
      affected_families_count,
      compensation_disputed_flag,
      environmental_clearance_status,
      litigations_count,
      public_hearing_completed,
      rehabilitation_progress_pct: Math.round(rehabilitation_progress_pct * 10) / 10,
      bureaucratic_delay_days: Math.round(bureaucratic_delay_days),
      target_delayed,
    });
  }

  return records;
}

function buildBreakdown(
  records: ProjectRecord[],
  keyFn: (r: ProjectRecord) => string,
  orderedKeys?: string[]
): CategoryBreakdown[] {
  const map = new Map<string, { total: number; delayed: number }>();

  for (const r of records) {
    const k = keyFn(r);
    const curr = map.get(k) ?? { total: 0, delayed: 0 };
    curr.total += 1;
    curr.delayed += r.target_delayed;
    map.set(k, curr);
  }

  const keys = orderedKeys
    ? orderedKeys.filter((k) => map.has(k))
    : Array.from(map.keys());

  return keys.map((label) => {
    const item = map.get(label)!;
    return {
      label,
      total: item.total,
      delayed: item.delayed,
      delayRatePct: item.total > 0 ? Math.round((item.delayed / item.total) * 1000) / 10 : 0,
    };
  });
}

export function computeDatasetStats(records: ProjectRecord[]): DatasetStats {
  const totalProjects = records.length;
  if (totalProjects === 0) {
    return {
      totalProjects: 0,
      delayedProjects: 0,
      onTrackProjects: 0,
      overallDelayRatePct: 0,
      avgLitigations: 0,
      avgBureaucraticDays: 0,
      avgRehabPct: 0,
      byRegion: [],
      byProjectType: [],
      byClearance: [],
      byLitigations: [],
    };
  }

  let delayedProjects = 0;
  let sumLit = 0;
  let sumDays = 0;
  let sumRehab = 0;

  for (const r of records) {
    delayedProjects += r.target_delayed;
    sumLit += r.litigations_count;
    sumDays += r.bureaucratic_delay_days;
    sumRehab += r.rehabilitation_progress_pct;
  }

  const onTrackProjects = totalProjects - delayedProjects;
  const overallDelayRatePct = Math.round((delayedProjects / totalProjects) * 1000) / 10;

  const byLitBucket = buildBreakdown(
    records,
    (r) => {
      if (r.litigations_count === 0) return '0 Suits';
      if (r.litigations_count === 1) return '1 Suit';
      if (r.litigations_count === 2) return '2 Suits';
      return '3+ Suits';
    },
    ['0 Suits', '1 Suit', '2 Suits', '3+ Suits']
  );

  return {
    totalProjects,
    delayedProjects,
    onTrackProjects,
    overallDelayRatePct,
    avgLitigations: Math.round((sumLit / totalProjects) * 100) / 100,
    avgBureaucraticDays: Math.round(sumDays / totalProjects),
    avgRehabPct: Math.round((sumRehab / totalProjects) * 10) / 10,
    byRegion: buildBreakdown(records, (r) => r.region, INDIAN_STATES),
    byProjectType: buildBreakdown(records, (r) => r.project_type, PROJECT_TYPES),
    byClearance: buildBreakdown(
      records,
      (r) => r.environmental_clearance_status,
      CLEARANCE_STATUSES
    ),
    byLitigations: byLitBucket,
  };
}

export function findComparableCohort(
  params: ProjectParameters,
  records: ProjectRecord[]
): CohortStats {
  if (records.length === 0) {
    return {
      matchedCount: 0,
      delayedCount: 0,
      historicalDelayRatePct: 50,
      scopeLabel: 'Reference Baseline',
      avgLitigations: 1.2,
      avgRehabPct: 60,
    };
  }

  const exactCohort = records.filter(
    (r) =>
      r.project_type === params.project_type &&
      r.region === params.region &&
      r.environmental_clearance_status === params.environmental_clearance_status
  );

  const regionalCohort =
    exactCohort.length >= 15
      ? exactCohort
      : records.filter(
          (r) => r.project_type === params.project_type && r.region === params.region
        );

  const cohort = regionalCohort.length > 0 ? regionalCohort : records;
  const scopeLabel =
    exactCohort.length >= 15
      ? `${params.project_type} · ${params.region} (${params.environmental_clearance_status})`
      : `${params.project_type} · ${params.region}`;

  let delayedCount = 0;
  let sumLit = 0;
  let sumRehab = 0;

  for (const r of cohort) {
    delayedCount += r.target_delayed;
    sumLit += r.litigations_count;
    sumRehab += r.rehabilitation_progress_pct;
  }

  return {
    matchedCount: cohort.length,
    delayedCount,
    historicalDelayRatePct: Math.round((delayedCount / cohort.length) * 1000) / 10,
    scopeLabel,
    avgLitigations: Math.round((sumLit / cohort.length) * 10) / 10,
    avgRehabPct: Math.round((sumRehab / cohort.length) * 10) / 10,
  };
}

/**
 * Calibrated risk and additive Shapley attribution engine grounded in the
 * SIH26017 dataset formula:
 *   delay_score = (litigations * 2.5) + (disputed * 3.0) + (pending_env * 3.5) - (rehab / 30)
 * Extended with calibrated operational weights for bureaucratic backlog,
 * public hearing completion, land corridor footprint, displaced families,
 * project complexity, and regional variance.
 */
export function predictProjectRisk(
  params: ProjectParameters,
  records: ProjectRecord[]
): PredictionResult {
  const baseProbabilityPct = 50.0;
  const engineered = computeEngineeredFeatures(params);
  const delayForecast = forecastScheduleOverrunDays(params);

  const coreDelayScore =
    params.litigations_count * 2.5 +
    params.compensation_disputed_flag * 3.0 +
    (params.environmental_clearance_status === 'Pending'
      ? 3.5
      : params.environmental_clearance_status === 'Under Review'
        ? 1.1
        : 0) -
    params.rehabilitation_progress_pct / 30;

  // Individual centered log-odds contributions around dataset medians:
  // Dataset medians: litigations=1.2, disputed=0.3, env=0.3*3.5+0.2*1.1=1.27, rehab=60
  const litLogOdds = (params.litigations_count - 1.2) * 1.15;
  const dispLogOdds = (params.compensation_disputed_flag - 0.3) * 1.55;
  const envRaw =
    params.environmental_clearance_status === 'Pending'
      ? 1.72
      : params.environmental_clearance_status === 'Under Review'
        ? 0.45
        : -0.78;
  const envLogOdds = envRaw;

  const rehabLogOdds = ((60 - params.rehabilitation_progress_pct) / 30) * 0.72;
  const hearingLogOdds = params.public_hearing_completed === 0 ? 0.58 : -0.14;
  const bureauLogOdds = clamp((params.bureaucratic_delay_days - 45) / 140, -0.22, 0.72);
  const familiesLogOdds = clamp((params.affected_families_count - 850) / 3800, -0.18, 0.42);
  const sizeLogOdds = clamp((params.region_size_hectares - 240) / 950, -0.15, 0.24);

  const typeWeights: Record<ProjectType, number> = {
    'Industrial Corridor': 0.16,
    Railway: 0.08,
    Highway: 0.02,
    'Rural Road': -0.14,
  };
  const typeLogOdds = typeWeights[params.project_type] ?? 0;

  const regionWeights: Record<IndianState, number> = {
    Odisha: 0.12,
    Maharashtra: 0.06,
    'Uttar Pradesh': 0.04,
    'Madhya Pradesh': 0.0,
    Karnataka: -0.04,
    Gujarat: -0.09,
  };
  const regionLogOdds = regionWeights[params.region] ?? 0;

  const rawEntries: Array<{
    key: keyof ProjectParameters;
    label: string;
    displayValue: string;
    rawLogOdds: number;
  }> = [
    {
      key: 'litigations_count',
      label: 'Active Litigations',
      displayValue: `${params.litigations_count} ${params.litigations_count === 1 ? 'case' : 'cases'}`,
      rawLogOdds: litLogOdds,
    },
    {
      key: 'environmental_clearance_status',
      label: 'Environmental Clearance',
      displayValue: params.environmental_clearance_status,
      rawLogOdds: envLogOdds,
    },
    {
      key: 'compensation_disputed_flag',
      label: 'Compensation Dispute',
      displayValue: params.compensation_disputed_flag === 1 ? 'Disputed' : 'Undisputed',
      rawLogOdds: dispLogOdds,
    },
    {
      key: 'rehabilitation_progress_pct',
      label: 'Rehabilitation & Resettlement',
      displayValue: `${params.rehabilitation_progress_pct.toFixed(0)}% complete`,
      rawLogOdds: rehabLogOdds,
    },
    {
      key: 'public_hearing_completed',
      label: 'Public Hearing (SIA)',
      displayValue: params.public_hearing_completed === 1 ? 'Completed' : 'Pending',
      rawLogOdds: hearingLogOdds,
    },
    {
      key: 'bureaucratic_delay_days',
      label: 'Administrative File Latency',
      displayValue: `${params.bureaucratic_delay_days} days`,
      rawLogOdds: bureauLogOdds,
    },
    {
      key: 'affected_families_count',
      label: 'Affected Families',
      displayValue: params.affected_families_count.toLocaleString(),
      rawLogOdds: familiesLogOdds,
    },
    {
      key: 'region_size_hectares',
      label: 'Acquisition Footprint',
      displayValue: `${params.region_size_hectares.toFixed(0)} ha`,
      rawLogOdds: sizeLogOdds,
    },
    {
      key: 'project_type',
      label: 'Corridor Classification',
      displayValue: params.project_type,
      rawLogOdds: typeLogOdds,
    },
    {
      key: 'region',
      label: 'State Jurisdiction',
      displayValue: params.region,
      rawLogOdds: regionLogOdds,
    },
  ];

  const totalLogOdds = rawEntries.reduce((acc, item) => acc + item.rawLogOdds, 0);
  const rawProb = sigmoid(totalLogOdds) * 100;
  const probabilityPct = Math.round(clamp(rawProb, 2.0, 98.5) * 10) / 10;
  const deltaFromBase = probabilityPct - baseProbabilityPct;

  // Map log-odds proportionally so SHAP bars sum cleanly to (probabilityPct - 50.0)
  const shapContributions: ShapContribution[] = rawEntries
    .map((entry) => {
      const impactPct =
        Math.abs(totalLogOdds) > 1e-6
          ? (entry.rawLogOdds / totalLogOdds) * deltaFromBase
          : entry.rawLogOdds * 15;
      const roundedImpact = Math.round(impactPct * 10) / 10;
      return {
        key: entry.key,
        label: entry.label,
        displayValue: entry.displayValue,
        impactPct: roundedImpact,
        rawLogOdds: Math.round(entry.rawLogOdds * 100) / 100,
        direction:
          roundedImpact > 0.2
            ? ('risk' as const)
            : roundedImpact < -0.2
              ? ('mitigation' as const)
              : ('neutral' as const),
      };
    })
    .sort((a, b) => Math.abs(b.impactPct) - Math.abs(a.impactPct));

  const riskTier: RiskTier =
    probabilityPct >= 70
      ? 'Critical Risk'
      : probabilityPct >= 40
        ? 'Moderate Watch'
        : 'Low Risk / On Track';

  const predictedDelayed: 0 | 1 = probabilityPct >= 50 ? 1 : 0;

  const positiveDrivers = shapContributions
    .filter((c) => c.impactPct > 0.5)
    .sort((a, b) => b.impactPct - a.impactPct);

  const primaryDriver =
    positiveDrivers.length > 0
      ? formatDriverHeadline(positiveDrivers[0].key, params)
      : 'No Dominant Bottleneck';

  const secondaryDriver =
    positiveDrivers.length > 1
      ? formatDriverHeadline(positiveDrivers[1].key, params)
      : 'Baseline Corridor Complexity';

  const recommendations = buildRecommendations(params, probabilityPct);
  const cohortStats = findComparableCohort(params, records);

  return {
    probabilityPct,
    predictedDelayed,
    riskTier,
    primaryDriver,
    secondaryDriver,
    baseProbabilityPct,
    delayScore: Math.round(coreDelayScore * 100) / 100,
    engineered,
    delayForecast,
    shapContributions,
    recommendations,
    cohortStats,
  };
}

function formatDriverHeadline(
  key: keyof ProjectParameters,
  params: ProjectParameters
): string {
  switch (key) {
    case 'environmental_clearance_status':
      return `Environmental Clearance (${params.environmental_clearance_status})`;
    case 'litigations_count':
      return `Active Litigations (${params.litigations_count} ${params.litigations_count === 1 ? 'case' : 'cases'})`;
    case 'compensation_disputed_flag':
      return 'Compensation Valuation Dispute';
    case 'rehabilitation_progress_pct':
      return `Rehabilitation Lag (${params.rehabilitation_progress_pct.toFixed(0)}%)`;
    case 'public_hearing_completed':
      return 'Pending SIA Public Hearing';
    case 'bureaucratic_delay_days':
      return `File Processing Lag (${params.bureaucratic_delay_days}d)`;
    case 'affected_families_count':
      return `High Displacement (${params.affected_families_count.toLocaleString()} families)`;
    case 'region_size_hectares':
      return `Large Footprint (${params.region_size_hectares.toFixed(0)} ha)`;
    case 'project_type':
      return `${params.project_type} Scope`;
    case 'region':
      return `${params.region} Clearance Pace`;
  }
}

function buildRecommendations(
  params: ProjectParameters,
  probabilityPct: number
): RecommendationItem[] {
  const items: RecommendationItem[] = [];

  if (params.environmental_clearance_status !== 'Approved') {
    items.push({
      id: 'env-clearance',
      title:
        params.environmental_clearance_status === 'Pending'
          ? 'Escalate PARIVESH / MoEFCC Appraisal'
          : 'Close Expert Appraisal Committee Queries',
      authority: 'State SEIAA / MoEFCC Nodal Desk',
      horizon: '0–21 Days',
      priority: params.environmental_clearance_status === 'Pending' ? 'Immediate' : 'Targeted',
      action:
        params.environmental_clearance_status === 'Pending'
          ? 'Submit consolidated Terms of Reference (ToR) compliance dossier and assign a dedicated forest/environment nodal officer for weekly PARIVESH tracking.'
          : 'Convene a pre-appraisal technical review to clear pending EIA observations prior to the next EAC sitting.',
    });
  }

  if (params.litigations_count >= 2) {
    items.push({
      id: 'litigation-cell',
      title: 'Activate Fast-Track Arbitration & Legal Cell',
      authority: 'CALA & District Collectorate Legal Desk',
      horizon: '0–30 Days',
      priority: 'Immediate',
      action: `Consolidate ${params.litigations_count} pending stay petitions under RFCTLARR Section 64 Authority referrals and route title-boundary claims through Lok Adalat mediation.`,
    });
  } else if (params.litigations_count === 1) {
    items.push({
      id: 'litigation-monitor',
      title: 'Pre-Emptive Mediation on Single Litigation',
      authority: 'Competent Authority for Land Acquisition (CALA)',
      horizon: '15–45 Days',
      priority: 'Targeted',
      action:
        'Audit land-record mutation gaps behind the active dispute and offer structured out-of-court settlement terms before injunction hearings.',
    });
  }

  if (params.compensation_disputed_flag === 1) {
    items.push({
      id: 'compensation-escrow',
      title: 'Release Uncontested Award & Escrow Remainder',
      authority: 'District Treasury & PFMS Disbursement Unit',
      horizon: '0–14 Days',
      priority: 'Immediate',
      action:
        'Disburse 80% undisputed Section 23 compensation directly via PFMS/DBT while Ring-fencing disputed multiplier differentials in an interest-bearing escrow account.',
    });
  }

  if (params.public_hearing_completed === 0) {
    items.push({
      id: 'public-hearing',
      title: 'Notify Statutory SIA & Gram Sabha Hearing',
      authority: 'Social Impact Assessment (SIA) Unit',
      horizon: '0–21 Days',
      priority: 'Immediate',
      action:
        'Publish 30-day statutory notice under Section 4 of RFCTLARR Act 2013 and circulate vernacular compensation schedules across affected panchayats.',
    });
  }

  if (params.rehabilitation_progress_pct < 55) {
    items.push({
      id: 'rehab-sprint',
      title: 'Accelerate R&R Plot Allotment & Utility Handover',
      authority: 'Rehabilitation & Resettlement Commissioner',
      horizon: '15–60 Days',
      priority: params.rehabilitation_progress_pct < 35 ? 'Immediate' : 'Targeted',
      action: `Current R&R progress is ${params.rehabilitation_progress_pct.toFixed(0)}%. Prioritize possession-linked subsistence grants and complete civic amenities at resettlement sites to unlock physical corridor handover.`,
    });
  }

  if (params.bureaucratic_delay_days > 75) {
    items.push({
      id: 'file-latency',
      title: 'Clear Inter-Departmental Joint Verification Backlog',
      authority: 'Chief Secretary PMG / Revenue & Forest Departments',
      horizon: '7–21 Days',
      priority: 'Targeted',
      action: `File movement latency (${params.bureaucratic_delay_days} days) exceeds threshold. Table corridor at the monthly Project Monitoring Group (PMG) review for joint mutation sign-off.`,
    });
  }

  if (items.length === 0) {
    items.push({
      id: 'standard-cadence',
      title: 'Maintain Standard Possession & Award Cadence',
      authority: 'Project Implementation Unit (PIU)',
      horizon: 'Ongoing',
      priority: 'Standard',
      action:
        probabilityPct < 30
          ? 'All statutory clearances and R&R indicators are well within tolerance. Continue fortnightly mutation audits and utility shifting.'
          : 'Parameters are within acceptable tolerance; keep monthly checkpoints on R&R disbursement and joint survey milestones.',
    });
  }

  return items.slice(0, 4);
}
