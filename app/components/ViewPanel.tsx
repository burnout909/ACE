import type { ReactNode } from "react";

type ViewPanelProps = {
  label: string;
  isActive: boolean;
  onActivate: () => void;
  children: ReactNode;
};

export default function ViewPanel({
  label,
  isActive,
  onActivate,
  children
}: ViewPanelProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onActivate}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          onActivate();
        }
      }}
      className={`relative overflow-hidden rounded-2xl border bg-white/80 p-3 shadow-sm ${
        isActive
          ? "border-sky-400 ring-2 ring-sky-200"
          : "border-slate-200 hover:border-slate-300"
      }`}
    >
      <div className="absolute left-4 top-4 z-10 rounded-full bg-white/90 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 shadow">
        {label}
      </div>
      {children}
    </div>
  );
}
