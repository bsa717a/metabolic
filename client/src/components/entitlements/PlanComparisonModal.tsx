import { X } from 'lucide-react';
import { Card } from '../ui/Card';
import { PlanComparisonSection } from './PlanComparisonSection';

export function PlanComparisonModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/40 p-4 sm:p-6"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="plan-comparison-title"
    >
      <div className="flex min-h-full items-start justify-center py-4">
        <Card
          className="relative w-full max-w-5xl p-6 sm:p-8"
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            className="absolute right-4 top-4 rounded-lg p-1 text-app-text-muted hover:bg-app-muted hover:text-app-text"
            onClick={onClose}
            aria-label="Close plan comparison"
          >
            <X size={20} aria-hidden />
          </button>
          <div id="plan-comparison-title" className="sr-only">
            Plan comparison
          </div>
          <PlanComparisonSection />
        </Card>
      </div>
    </div>
  );
}
