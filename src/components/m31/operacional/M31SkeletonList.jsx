export default function M31SkeletonList() {
  return (
    <div aria-label="Carregando operações" className="space-y-3" role="status">
      {[0, 1, 2].map((item) => (
        <div key={item} className="animate-pulse rounded-xl border border-m31-border bg-m31-surface p-4">
          <div className="flex gap-3">
            <div className="h-12 w-12 rounded-lg bg-stone-200" />
            <div className="flex-1 space-y-2 pt-1">
              <div className="h-4 w-28 rounded bg-stone-200" />
              <div className="h-3 w-48 max-w-full rounded bg-stone-100" />
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="h-16 rounded-lg bg-stone-100" />
            <div className="h-16 rounded-lg bg-stone-100" />
          </div>
        </div>
      ))}
    </div>
  );
}

