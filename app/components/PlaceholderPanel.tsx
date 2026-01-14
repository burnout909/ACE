type PlaceholderPanelProps = {
  status: string | null;
};

export default function PlaceholderPanel({ status }: PlaceholderPanelProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-slate-200 bg-white/60 p-4 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
        <svg
          viewBox="0 0 24 24"
          className="h-6 w-6"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <path d="M4 7h16M4 17h16" />
          <rect x="3" y="5" width="18" height="14" rx="3" />
          <path d="M9 10l6 4-6 4v-8z" />
        </svg>
      </div>
      <div>
        <p className="text-sm font-semibold text-slate-700">Placeholder</p>
        <p className="text-xs text-slate-500">Coming soon</p>
      </div>
    </div>
  );
}
