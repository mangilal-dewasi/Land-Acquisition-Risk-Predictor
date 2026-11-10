import { useState } from 'react';
import { BookmarkPlus, Minus, Plus } from 'lucide-react';
import type {
  ClearanceStatus,
  IndianState,
  ProjectParameters,
  ProjectType,
} from '../types/project';
import {
  CLEARANCE_STATUSES,
  INDIAN_STATES,
  PRESET_SCENARIOS,
  PROJECT_TYPES,
} from '../utils/riskEngine';

interface ParameterSidebarProps {
  parameters: ProjectParameters;
  onChange: (next: ProjectParameters) => void;
  onSaveScenario: (customName?: string) => void;
}

export default function ParameterSidebar({
  parameters,
  onChange,
  onSaveScenario,
}: ParameterSidebarProps) {
  const [scenarioName, setScenarioName] = useState('');

  const updateField = <K extends keyof ProjectParameters>(
    key: K,
    value: ProjectParameters[K]
  ) => {
    onChange({ ...parameters, [key]: value });
  };

  const handleSave = () => {
    onSaveScenario(scenarioName.trim() || undefined);
    setScenarioName('');
  };

  return (
    <section
      aria-label="Project Parameters"
      className="bg-[#162032] border border-slate-800 rounded-lg divide-y divide-slate-800"
    >
      <div className="p-4 sm:p-5 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display text-sm font-semibold text-slate-100">
            Project Parameters
          </h2>
          <div className="flex flex-wrap items-center gap-1.5">
            {PRESET_SCENARIOS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => onChange({ ...preset.parameters })}
                className="px-2 py-1 rounded border border-slate-700 bg-slate-800/70 text-[11px] font-medium text-slate-300 hover:bg-slate-800 hover:text-white transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2 pt-1">
          <input
            type="text"
            value={scenarioName}
            onChange={(e) => setScenarioName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSave();
            }}
            placeholder="Scenario name (optional)"
            aria-label="Scenario name"
            className="flex-1 min-w-0 h-8 rounded-md border border-slate-700 bg-[#0F172A] px-2.5 text-xs text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <button
            type="button"
            onClick={handleSave}
            className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md border border-slate-700 bg-slate-800/80 text-xs font-medium text-slate-200 hover:bg-slate-800 hover:text-white transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <BookmarkPlus className="h-3.5 w-3.5 text-blue-400" />
            <span>Save</span>
          </button>
        </div>
      </div>

      {/* Corridor Scope */}
      <div className="p-4 sm:p-5 space-y-4">
        <div className="text-xs font-semibold text-slate-400">
          Corridor Scope
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label
              htmlFor="param-project-type"
              className="block text-xs font-medium text-slate-300 mb-1"
            >
              Project Type
            </label>
            <select
              id="param-project-type"
              value={parameters.project_type}
              onChange={(e) =>
                updateField('project_type', e.target.value as ProjectType)
              }
              className="w-full h-9 rounded-md border border-slate-700 bg-[#0F172A] px-2.5 text-sm text-slate-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {PROJECT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="param-region"
              className="block text-xs font-medium text-slate-300 mb-1"
            >
              State
            </label>
            <select
              id="param-region"
              value={parameters.region}
              onChange={(e) =>
                updateField('region', e.target.value as IndianState)
              }
              className="w-full h-9 rounded-md border border-slate-700 bg-[#0F172A] px-2.5 text-sm text-slate-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {INDIAN_STATES.map((state) => (
                <option key={state} value={state}>
                  {state}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label
              htmlFor="param-size-hectares"
              className="text-xs font-medium text-slate-300"
            >
              Acquisition Area (Hectares)
            </label>
            <span className="font-mono text-xs font-semibold tabular-nums text-slate-100">
              {parameters.region_size_hectares.toFixed(0)} ha
            </span>
          </div>
          <input
            id="param-size-hectares"
            type="range"
            min={20}
            max={500}
            step={5}
            value={parameters.region_size_hectares}
            onChange={(e) =>
              updateField('region_size_hectares', Number(e.target.value))
            }
            className="w-full risk-slider"
          />
          <div className="flex justify-between text-[11px] font-mono text-slate-500 mt-1">
            <span>20 ha</span>
            <span>500 ha</span>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label
              htmlFor="param-families"
              className="text-xs font-medium text-slate-300"
            >
              Affected Families
            </label>
            <input
              aria-label="Affected Families count"
              type="number"
              min={50}
              max={5000}
              step={10}
              value={parameters.affected_families_count}
              onChange={(e) => {
                const raw = Number.parseInt(e.target.value, 10);
                if (!Number.isNaN(raw)) {
                  updateField(
                    'affected_families_count',
                    Math.min(5000, Math.max(50, raw))
                  );
                }
              }}
              className="w-24 h-7 rounded border border-slate-700 bg-[#0F172A] px-2 text-right font-mono text-xs tabular-nums text-slate-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <input
            id="param-families"
            type="range"
            min={50}
            max={5000}
            step={25}
            value={parameters.affected_families_count}
            onChange={(e) =>
              updateField('affected_families_count', Number(e.target.value))
            }
            className="w-full risk-slider"
          />
        </div>
      </div>

      {/* Statutory & Legal */}
      <div className="p-4 sm:p-5 space-y-4">
        <div className="text-xs font-semibold text-slate-400">
          Statutory & Legal
        </div>

        <div>
          <span className="block text-xs font-medium text-slate-300 mb-1.5">
            Environmental Clearance
          </span>
          <div
            role="radiogroup"
            aria-label="Environmental Clearance Status"
            className="grid grid-cols-3 rounded-md border border-slate-800 bg-[#0F172A] p-0.5 gap-0.5"
          >
            {CLEARANCE_STATUSES.map((status: ClearanceStatus) => {
              const selected =
                parameters.environmental_clearance_status === status;
              return (
                <button
                  key={status}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() =>
                    updateField('environmental_clearance_status', status)
                  }
                  className={`py-1.5 px-2 rounded text-xs font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                    selected
                      ? 'bg-slate-800 text-slate-100 border border-slate-700'
                      : 'text-slate-400 hover:text-slate-200 border border-transparent'
                  }`}
                >
                  {status}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <span className="block text-xs font-medium text-slate-300 mb-1.5">
              Compensation Disputed
            </span>
            <div
              role="radiogroup"
              aria-label="Compensation Disputed"
              className="grid grid-cols-2 rounded-md border border-slate-800 bg-[#0F172A] p-0.5 gap-0.5"
            >
              {(
                [
                  { label: 'No', value: 0 },
                  { label: 'Yes', value: 1 },
                ] as const
              ).map((opt) => {
                const selected =
                  parameters.compensation_disputed_flag === opt.value;
                return (
                  <button
                    key={opt.label}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() =>
                      updateField('compensation_disputed_flag', opt.value)
                    }
                    className={`py-1.5 px-2 rounded text-xs font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                      selected
                        ? 'bg-slate-800 text-slate-100 border border-slate-700'
                        : 'text-slate-400 hover:text-slate-200 border border-transparent'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <span className="block text-xs font-medium text-slate-300 mb-1.5">
              Public Hearing
            </span>
            <div
              role="radiogroup"
              aria-label="Public Hearing Completed"
              className="grid grid-cols-2 rounded-md border border-slate-800 bg-[#0F172A] p-0.5 gap-0.5"
            >
              {(
                [
                  { label: 'Completed', value: 1 },
                  { label: 'Pending', value: 0 },
                ] as const
              ).map((opt) => {
                const selected =
                  parameters.public_hearing_completed === opt.value;
                return (
                  <button
                    key={opt.label}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() =>
                      updateField('public_hearing_completed', opt.value)
                    }
                    className={`py-1.5 px-2 rounded text-xs font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                      selected
                        ? 'bg-slate-800 text-slate-100 border border-slate-700'
                        : 'text-slate-400 hover:text-slate-200 border border-transparent'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label
              htmlFor="param-litigations"
              className="text-xs font-medium text-slate-300"
            >
              Active Litigations
            </label>
            <div className="inline-flex items-center border border-slate-700 rounded-md bg-[#0F172A]">
              <button
                type="button"
                onClick={() =>
                  updateField(
                    'litigations_count',
                    Math.max(0, parameters.litigations_count - 1)
                  )
                }
                disabled={parameters.litigations_count <= 0}
                aria-label="Decrease active litigations"
                className="h-7 w-7 inline-flex items-center justify-center text-slate-300 hover:bg-slate-800 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
              <span className="w-8 text-center font-mono text-xs font-semibold tabular-nums text-slate-100">
                {parameters.litigations_count}
              </span>
              <button
                type="button"
                onClick={() =>
                  updateField(
                    'litigations_count',
                    Math.min(10, parameters.litigations_count + 1)
                  )
                }
                disabled={parameters.litigations_count >= 10}
                aria-label="Increase active litigations"
                className="h-7 w-7 inline-flex items-center justify-center text-slate-300 hover:bg-slate-800 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          <input
            id="param-litigations"
            type="range"
            min={0}
            max={10}
            step={1}
            value={parameters.litigations_count}
            onChange={(e) =>
              updateField('litigations_count', Number(e.target.value))
            }
            className="w-full risk-slider"
          />
          <div className="flex justify-between text-[11px] font-mono text-slate-500 mt-1">
            <span>0</span>
            <span>10</span>
          </div>
        </div>
      </div>

      {/* Execution Progress */}
      <div className="p-4 sm:p-5 space-y-4">
        <div className="text-xs font-semibold text-slate-400">
          Execution Progress
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label
              htmlFor="param-rehab"
              className="text-xs font-medium text-slate-300"
            >
              Rehabilitation Progress
            </label>
            <span className="font-mono text-xs font-semibold tabular-nums text-slate-100">
              {parameters.rehabilitation_progress_pct.toFixed(0)}%
            </span>
          </div>
          <input
            id="param-rehab"
            type="range"
            min={0}
            max={100}
            step={1}
            value={parameters.rehabilitation_progress_pct}
            onChange={(e) =>
              updateField('rehabilitation_progress_pct', Number(e.target.value))
            }
            className="w-full risk-slider"
          />
          <div className="flex justify-between text-[11px] font-mono text-slate-500 mt-1">
            <span>0%</span>
            <span>50%</span>
            <span>100%</span>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label
              htmlFor="param-bureaucratic"
              className="text-xs font-medium text-slate-300"
            >
              File Processing Delay
            </label>
            <span className="font-mono text-xs font-semibold tabular-nums text-slate-100">
              {parameters.bureaucratic_delay_days} days
            </span>
          </div>
          <input
            id="param-bureaucratic"
            type="range"
            min={0}
            max={420}
            step={5}
            value={parameters.bureaucratic_delay_days}
            onChange={(e) =>
              updateField('bureaucratic_delay_days', Number(e.target.value))
            }
            className="w-full risk-slider"
          />
          <div className="flex justify-between text-[11px] font-mono text-slate-500 mt-1">
            <span>0d</span>
            <span>180d</span>
            <span>420d</span>
          </div>
        </div>
      </div>
    </section>
  );
}
