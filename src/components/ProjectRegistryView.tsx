import { useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Download,
  RotateCcw,
  Search,
  SlidersHorizontal,
} from 'lucide-react';
import type {
  ClearanceStatus,
  IndianState,
  ProjectParameters,
  ProjectRecord,
  ProjectType,
} from '../types/project';
import {
  CLEARANCE_STATUSES,
  INDIAN_STATES,
  PROJECT_TYPES,
} from '../utils/riskEngine';

interface ProjectRegistryViewProps {
  records: ProjectRecord[];
  loading: boolean;
  error: string | null;
  onRetryLoad: () => void;
  onAnalyzeRecord: (params: ProjectParameters) => void;
}

type SortField =
  | 'project_id'
  | 'region_size_hectares'
  | 'affected_families_count'
  | 'litigations_count'
  | 'rehabilitation_progress_pct'
  | 'bureaucratic_delay_days'
  | 'target_delayed';

const PAGE_SIZE = 25;

export default function ProjectRegistryView({
  records,
  loading,
  error,
  onRetryLoad,
  onAnalyzeRecord,
}: ProjectRegistryViewProps) {
  const [search, setSearch] = useState('');
  const [stateFilter, setStateFilter] = useState<'ALL' | IndianState>('ALL');
  const [typeFilter, setTypeFilter] = useState<'ALL' | ProjectType>('ALL');
  const [clearanceFilter, setClearanceFilter] = useState<
    'ALL' | ClearanceStatus
  >('ALL');
  const [outcomeFilter, setOutcomeFilter] = useState<
    'ALL' | 'DELAYED' | 'ON_TRACK'
  >('ALL');
  const [sortField, setSortField] = useState<SortField>('project_id');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return records.filter((r) => {
      if (stateFilter !== 'ALL' && r.region !== stateFilter) return false;
      if (typeFilter !== 'ALL' && r.project_type !== typeFilter) return false;
      if (
        clearanceFilter !== 'ALL' &&
        r.environmental_clearance_status !== clearanceFilter
      ) {
        return false;
      }
      if (outcomeFilter === 'DELAYED' && r.target_delayed !== 1) return false;
      if (outcomeFilter === 'ON_TRACK' && r.target_delayed !== 0) return false;
      if (q) {
        const hay = `${r.project_id} ${r.project_type} ${r.region}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [
    records,
    search,
    stateFilter,
    typeFilter,
    clearanceFilter,
    outcomeFilter,
  ]);

  const sorted = useMemo(() => {
    const copy = [...filtered];
    copy.sort((a, b) => {
      const av = a[sortField];
      const bv = b[sortField];
      if (typeof av === 'string' && typeof bv === 'string') {
        return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      const na = Number(av);
      const nb = Number(bv);
      return sortDir === 'asc' ? na - nb : nb - na;
    });
    return copy;
  }, [filtered, sortField, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);

  const pageRows = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return sorted.slice(start, start + PAGE_SIZE);
  }, [sorted, safePage]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir(field === 'project_id' ? 'asc' : 'desc');
    }
    setPage(1);
  };

  const resetFilters = () => {
    setSearch('');
    setStateFilter('ALL');
    setTypeFilter('ALL');
    setClearanceFilter('ALL');
    setOutcomeFilter('ALL');
    setPage(1);
  };

  const handleExportCsv = () => {
    const headers = [
      'project_id',
      'project_type',
      'region',
      'region_size_hectares',
      'affected_families_count',
      'compensation_disputed_flag',
      'environmental_clearance_status',
      'litigations_count',
      'public_hearing_completed',
      'rehabilitation_progress_pct',
      'bureaucratic_delay_days',
      'target_delayed',
    ];
    const lines = [
      headers.join(','),
      ...sorted.map((r) =>
        [
          r.project_id,
          r.project_type,
          r.region,
          r.region_size_hectares,
          r.affected_families_count,
          r.compensation_disputed_flag,
          r.environmental_clearance_status,
          r.litigations_count,
          r.public_hearing_completed,
          r.rehabilitation_progress_pct,
          r.bureaucratic_delay_days,
          r.target_delayed,
        ].join(',')
      ),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `sih26017-filtered-projects-${sorted.length}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return <ArrowUpDown className="h-3 w-3 text-slate-500" />;
    }
    return sortDir === 'asc' ? (
      <ArrowUp className="h-3 w-3 text-slate-100" />
    ) : (
      <ArrowDown className="h-3 w-3 text-slate-100" />
    );
  };

  if (error) {
    return (
      <div className="bg-[#162032] border border-slate-800 rounded-lg p-8 text-center space-y-3">
        <h2 className="font-display text-base font-semibold text-slate-100">
          Unable to Load Project Registry
        </h2>
        <p className="text-sm text-slate-400 max-w-md mx-auto">{error}</p>
        <button
          type="button"
          onClick={onRetryLoad}
          className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-blue-600 text-xs font-medium text-white hover:bg-blue-500"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          <span>Retry Loading CSV</span>
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filter Toolbar */}
      <section
        aria-label="Registry Filters"
        className="bg-[#162032] border border-slate-800 rounded-lg p-4 space-y-3"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative flex-1 min-w-[220px] max-w-sm">
            <Search className="h-4 w-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search Project ID, state, or type…"
              aria-label="Search projects"
              className="w-full h-9 pl-9 pr-3 rounded-md border border-slate-700 bg-[#0F172A] text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-mono tabular-nums text-slate-400 mr-1">
              {loading
                ? 'Loading dataset…'
                : `${sorted.length.toLocaleString()} of ${records.length.toLocaleString()} records`}
            </span>

            <button
              type="button"
              onClick={resetFilters}
              className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md border border-slate-700 bg-slate-800/70 text-xs font-medium text-slate-200 hover:bg-slate-800 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              <RotateCcw className="h-3.5 w-3.5 text-slate-400" />
              <span>Clear Filters</span>
            </button>

            <button
              type="button"
              disabled={sorted.length === 0}
              onClick={handleExportCsv}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-slate-700 bg-slate-800/70 text-xs font-medium text-slate-200 hover:bg-slate-800 disabled:opacity-40 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              <Download className="h-3.5 w-3.5 text-slate-400" />
              <span>Export CSV</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
          <select
            aria-label="Filter by State"
            value={stateFilter}
            onChange={(e) => {
              setStateFilter(e.target.value as 'ALL' | IndianState);
              setPage(1);
            }}
            className="h-9 rounded-md border border-slate-700 bg-[#0F172A] px-2.5 text-xs font-medium text-slate-200 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="ALL">All States (6)</option>
            {INDIAN_STATES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          <select
            aria-label="Filter by Project Type"
            value={typeFilter}
            onChange={(e) => {
              setTypeFilter(e.target.value as 'ALL' | ProjectType);
              setPage(1);
            }}
            className="h-9 rounded-md border border-slate-700 bg-[#0F172A] px-2.5 text-xs font-medium text-slate-200 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="ALL">All Corridor Types (4)</option>
            {PROJECT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>

          <select
            aria-label="Filter by Clearance Status"
            value={clearanceFilter}
            onChange={(e) => {
              setClearanceFilter(e.target.value as 'ALL' | ClearanceStatus);
              setPage(1);
            }}
            className="h-9 rounded-md border border-slate-700 bg-[#0F172A] px-2.5 text-xs font-medium text-slate-200 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="ALL">All Clearances</option>
            {CLEARANCE_STATUSES.map((c) => (
              <option key={c} value={c}>
                Clearance: {c}
              </option>
            ))}
          </select>

          <select
            aria-label="Filter by Outcome"
            value={outcomeFilter}
            onChange={(e) => {
              setOutcomeFilter(
                e.target.value as 'ALL' | 'DELAYED' | 'ON_TRACK'
              );
              setPage(1);
            }}
            className="h-9 rounded-md border border-slate-700 bg-[#0F172A] px-2.5 text-xs font-medium text-slate-200 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="ALL">All Outcomes</option>
            <option value="DELAYED">Historically Delayed</option>
            <option value="ON_TRACK">Historically On Track</option>
          </select>
        </div>
      </section>

      {/* Data Table */}
      <section
        aria-label="Historical Projects Table"
        className="bg-[#162032] border border-slate-800 rounded-lg overflow-hidden"
      >
        {loading ? (
          <div className="p-6 space-y-3">
            {Array.from({ length: 8 }).map((_, idx) => (
              <div
                key={idx}
                className="h-9 rounded bg-slate-800/70 animate-pulse"
              />
            ))}
          </div>
        ) : pageRows.length === 0 ? (
          <div className="p-10 text-center space-y-3">
            <div className="font-display text-sm font-semibold text-slate-100">
              No matching projects found
            </div>
            <p className="text-xs text-slate-400">
              Try widening your search query or resetting active column filters.
            </p>
            <button
              type="button"
              onClick={resetFilters}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-slate-700 bg-slate-800/70 text-xs font-medium text-slate-200 hover:bg-slate-800"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Reset All Filters</span>
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-900/60 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  <th className="py-2.5 px-4 whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => handleSort('project_id')}
                      className="inline-flex items-center gap-1 hover:text-slate-100"
                    >
                      <span>Project ID</span>
                      {renderSortIcon('project_id')}
                    </button>
                  </th>
                  <th className="py-2.5 px-4 whitespace-nowrap">
                    Corridor & State
                  </th>
                  <th className="py-2.5 px-4 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => handleSort('region_size_hectares')}
                      className="inline-flex items-center gap-1 hover:text-slate-100"
                    >
                      <span>Area (ha)</span>
                      {renderSortIcon('region_size_hectares')}
                    </button>
                  </th>
                  <th className="py-2.5 px-4 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => handleSort('affected_families_count')}
                      className="inline-flex items-center gap-1 hover:text-slate-100"
                    >
                      <span>Families</span>
                      {renderSortIcon('affected_families_count')}
                    </button>
                  </th>
                  <th className="py-2.5 px-4 whitespace-nowrap">Clearance</th>
                  <th className="py-2.5 px-4 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => handleSort('litigations_count')}
                      className="inline-flex items-center gap-1 hover:text-slate-100"
                    >
                      <span>Suits</span>
                      {renderSortIcon('litigations_count')}
                    </button>
                  </th>
                  <th className="py-2.5 px-4 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => handleSort('rehabilitation_progress_pct')}
                      className="inline-flex items-center gap-1 hover:text-slate-100"
                    >
                      <span>R&R %</span>
                      {renderSortIcon('rehabilitation_progress_pct')}
                    </button>
                  </th>
                  <th className="py-2.5 px-4 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => handleSort('bureaucratic_delay_days')}
                      className="inline-flex items-center gap-1 hover:text-slate-100"
                    >
                      <span>Latency</span>
                      {renderSortIcon('bureaucratic_delay_days')}
                    </button>
                  </th>
                  <th className="py-2.5 px-4 whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => handleSort('target_delayed')}
                      className="inline-flex items-center gap-1 hover:text-slate-100"
                    >
                      <span>Outcome</span>
                      {renderSortIcon('target_delayed')}
                    </button>
                  </th>
                  <th className="py-2.5 px-4 text-right whitespace-nowrap">
                    Workbench
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 text-xs">
                {pageRows.map((row) => {
                  const envClass =
                    row.environmental_clearance_status === 'Pending'
                      ? 'text-rose-400 font-medium'
                      : row.environmental_clearance_status === 'Under Review'
                        ? 'text-amber-400 font-medium'
                        : 'text-teal-400 font-medium';

                  return (
                    <tr
                      key={row.project_id}
                      className="hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="py-2.5 px-4 font-mono font-medium text-slate-100 whitespace-nowrap">
                        {row.project_id}
                      </td>
                      <td className="py-2.5 px-4 text-slate-300 whitespace-nowrap">
                        <span className="font-medium text-slate-100">
                          {row.project_type}
                        </span>
                        <span className="text-slate-600 mx-1.5">·</span>
                        <span className="text-slate-400">{row.region}</span>
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-300 whitespace-nowrap">
                        {row.region_size_hectares.toFixed(1)}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-300 whitespace-nowrap">
                        {row.affected_families_count.toLocaleString()}
                      </td>
                      <td className={`py-2.5 px-4 whitespace-nowrap ${envClass}`}>
                        {row.environmental_clearance_status}
                        {row.compensation_disputed_flag === 1 && (
                          <span className="text-slate-500 font-normal">
                            {' '}
                            · Disputed
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-300 whitespace-nowrap">
                        {row.litigations_count}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-300 whitespace-nowrap">
                        {row.rehabilitation_progress_pct.toFixed(0)}%
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-300 whitespace-nowrap">
                        {row.bureaucratic_delay_days}d
                      </td>
                      <td className="py-2.5 px-4 whitespace-nowrap">
                        <span
                          className={
                            row.target_delayed === 1
                              ? 'text-rose-400 font-semibold'
                              : 'text-teal-400 font-semibold'
                          }
                        >
                          {row.target_delayed === 1 ? 'Delayed' : 'On Track'}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() =>
                            onAnalyzeRecord({
                              project_type: row.project_type,
                              region: row.region,
                              region_size_hectares: row.region_size_hectares,
                              affected_families_count:
                                row.affected_families_count,
                              compensation_disputed_flag:
                                row.compensation_disputed_flag,
                              environmental_clearance_status:
                                row.environmental_clearance_status,
                              litigations_count: row.litigations_count,
                              public_hearing_completed:
                                row.public_hearing_completed,
                              rehabilitation_progress_pct:
                                row.rehabilitation_progress_pct,
                              bureaucratic_delay_days:
                                row.bureaucratic_delay_days,
                            })
                          }
                          className="inline-flex items-center gap-1 text-xs font-medium text-blue-400 hover:text-blue-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded px-1.5 py-0.5"
                        >
                          <SlidersHorizontal className="h-3 w-3" />
                          <span>Analyze</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        {!loading && sorted.length > 0 && (
          <div className="px-4 py-3 border-t border-slate-800 bg-slate-900/50 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
            <div className="font-mono tabular-nums">
              Showing {((safePage - 1) * PAGE_SIZE + 1).toLocaleString()}–
              {Math.min(safePage * PAGE_SIZE, sorted.length).toLocaleString()} of{' '}
              {sorted.length.toLocaleString()}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={safePage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="inline-flex items-center gap-1 h-8 px-2.5 rounded border border-slate-700 bg-slate-800/70 text-xs font-medium text-slate-200 hover:bg-slate-800 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                <span>Previous</span>
              </button>
              <span className="font-mono tabular-nums px-2 text-slate-300">
                Page {safePage} / {totalPages}
              </span>
              <button
                type="button"
                disabled={safePage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="inline-flex items-center gap-1 h-8 px-2.5 rounded border border-slate-700 bg-slate-800/70 text-xs font-medium text-slate-200 hover:bg-slate-800 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                <span>Next</span>
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
