import { Download, Menu, RotateCcw } from 'lucide-react';
import type { ActiveView } from '../types/project';

interface TopBarProps {
  activeView: ActiveView;
  onOpenMobileMenu: () => void;
  onResetDefaults: () => void;
  onExportReport: () => void;
  exportSuccess: boolean;
}

const VIEW_LABELS: Record<ActiveView, string> = {
  assessment: 'Risk Assessment',
  comparison: 'Scenario Comparison',
  explainability: 'SHAP Explainability',
  registry: 'Project Registry',
  validation: 'Model Validation',
};

export default function TopBar({
  activeView,
  onOpenMobileMenu,
  onResetDefaults,
  onExportReport,
  exportSuccess,
}: TopBarProps) {
  return (
    <header className="sticky top-0 z-30 h-14 bg-[#162032]/95 backdrop-blur-sm border-b border-slate-800 px-4 sm:px-6 flex items-center justify-between gap-4">
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={onOpenMobileMenu}
          className="lg:hidden inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          aria-label="Open navigation"
        >
          <Menu className="h-4 w-4" />
        </button>

        <div className="flex items-baseline gap-2.5 min-w-0">
          <h1 className="font-display text-sm sm:text-base font-semibold text-slate-100 truncate">
            Land Acquisition Risk Predictor
          </h1>
          <span className="hidden sm:inline text-slate-600 shrink-0" aria-hidden="true">
            /
          </span>
          <span className="hidden sm:inline text-xs font-medium text-slate-400 whitespace-nowrap shrink-0">
            {VIEW_LABELS[activeView]}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={onResetDefaults}
          className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md border border-slate-700 bg-slate-800/70 text-xs font-medium text-slate-200 hover:bg-slate-800 hover:text-white transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          <RotateCcw className="h-3.5 w-3.5 text-slate-400" />
          <span>Reset</span>
        </button>

        <button
          type="button"
          onClick={onExportReport}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-blue-600 text-xs font-medium text-white hover:bg-blue-500 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 focus-visible:ring-offset-[#162032]"
        >
          <Download className="h-3.5 w-3.5" />
          <span>{exportSuccess ? 'Exported' : 'Export JSON'}</span>
        </button>
      </div>
    </header>
  );
}
