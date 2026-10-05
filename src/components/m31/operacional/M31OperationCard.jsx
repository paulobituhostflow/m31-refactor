import { ChevronRight } from 'lucide-react';

export default function M31OperationCard({ title, description, Icon, official, officialLabel, action, onClick }) {
  return (
    <button type="button" onClick={onClick} className="w-full rounded-xl border border-m31-border bg-m31-surface p-4 text-left transition-colors active:bg-m31-surface-warm">
      <span className="flex items-start gap-3">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-m31-primary-tint text-m31-primary">
          <Icon aria-hidden="true" className="h-6 w-6" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center justify-between gap-2">
            <span className="text-base font-bold text-m31-ink">{title}</span>
            <ChevronRight aria-hidden="true" className="h-5 w-5 shrink-0 text-m31-text-muted" />
          </span>
          <span className="mt-1 block text-sm leading-5 text-m31-text-muted">{description}</span>
        </span>
      </span>
      {action === undefined ? (
        <span className="mt-4 block rounded-lg bg-m31-surface-warm px-3 py-2">
          <span className="block text-2xl font-bold tabular-nums text-m31-ink">{official ?? '—'}</span>
          <span className="block text-xs font-medium text-m31-text-muted">{officialLabel}</span>
        </span>
      ) : (
        <span className="mt-4 grid grid-cols-2 gap-3">
          <span className="rounded-lg bg-m31-surface-warm px-3 py-2">
            <span className="block text-2xl font-bold tabular-nums text-m31-ink">{official ?? '—'}</span>
            <span className="block text-xs font-medium text-m31-text-muted">{officialLabel}</span>
          </span>
          <span className="rounded-lg bg-amber-50 px-3 py-2">
            <span className="block text-2xl font-bold tabular-nums text-amber-700">{action ?? '—'}</span>
            <span className="block text-xs font-medium text-amber-800">Precisam de ação</span>
          </span>
        </span>
      )}
    </button>
  );
}