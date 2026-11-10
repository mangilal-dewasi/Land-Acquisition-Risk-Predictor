import {
  BarChart3,
  Columns2,
  GitCompareArrows,
  SlidersHorizontal,
  Table2,
  X,
} from 'lucide-react';
import type { ActiveView } from '../types/project';

interface SidebarProps {
  activeView: ActiveView;
  onSelectView: (view: ActiveView) => void;
  totalProjects: number;
  savedCount: number;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

interface NavItem {
  id: ActiveView;
  label: string;
  icon: typeof SlidersHorizontal;
  meta?: string;
}

export default function Sidebar({
  activeView,
  onSelectView,
  totalProjects,
  savedCount,
  mobileOpen,
  onCloseMobile,
}: SidebarProps) {
  const navItems: NavItem[] = [
    {
      id: 'assessment',
      label: 'Risk Assessment',
      icon: SlidersHorizontal,
    },
    {
      id: 'comparison',
      label: 'Scenario Comparison',
      icon: Columns2,
      meta: savedCount > 0 ? String(savedCount) : undefined,
    },
    {
      id: 'explainability',
      label: 'SHAP Explainability',
      icon: GitCompareArrows,
    },
    {
      id: 'registry',
      label: 'Project Registry',
      icon: Table2,
      meta: totalProjects > 0 ? totalProjects.toLocaleString() : undefined,
    },
    {
      id: 'validation',
      label: 'Model Validation',
      icon: BarChart3,
    },
  ];

  const content = (
    <div className="flex h-full flex-col bg-[#162032] border-r border-slate-800">
      <div className="flex h-14 items-center justify-between px-5 border-b border-slate-800">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-blue-600/20 border border-blue-500/30 text-blue-400">
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M3 17l6-6 4 4 8-8" />
              <path d="M17 7h4v4" />
            </svg>
          </div>
          <div className="min-w-0">
            <div className="font-display text-sm font-semibold tracking-tight text-slate-100 truncate">
              Corridor Analytics
            </div>
            <div className="text-[11px] leading-none text-slate-400 truncate">
              Risk & Clearance
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onCloseMobile}
          className="lg:hidden inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-slate-800 hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          aria-label="Close navigation"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1" aria-label="Primary">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeView === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                onSelectView(item.id);
                onCloseMobile();
              }}
              aria-current={isActive ? 'page' : undefined}
              className={`w-full flex items-center justify-between gap-2.5 px-2.5 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                isActive
                  ? 'bg-slate-800 text-slate-50 border border-slate-700/80'
                  : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-100 border border-transparent'
              }`}
            >
              <span className="flex items-center gap-2.5 min-w-0">
                <Icon
                  className={`h-4 w-4 shrink-0 ${
                    isActive ? 'text-blue-400' : 'text-slate-500'
                  }`}
                />
                <span className="truncate">{item.label}</span>
              </span>
              {item.meta && (
                <span
                  className={`font-mono text-xs tabular-nums ${
                    isActive ? 'text-slate-300' : 'text-slate-500'
                  }`}
                >
                  {item.meta}
                </span>
              )}
            </button>
          );
        })}
      </nav>
    </div>
  );

  return (
    <>
      <aside className="hidden lg:block lg:w-60 lg:shrink-0">
        <div className="sticky top-0 h-screen">{content}</div>
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-[2px]"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <aside className="relative z-10 w-64 max-w-[80vw] h-full shadow-2xl">
            {content}
          </aside>
        </div>
      )}
    </>
  );
}
