import type { ReactNode } from "react";

type ViewPanelProps = {
  label: string;
  isActive: boolean;
  isThumbnail: boolean;
  onActivate: () => void;
  children: ReactNode;
};

export default function ViewPanel({
  label,
  isActive,
  isThumbnail,
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
          ? "border-yonsei-200 ring-2 ring-yonsei-50"
          : "border-slate-200 hover:border-slate-300"
      } ${isThumbnail ? "flex-1 opacity-40 blur-[1px] hover:opacity-70 hover:blur-none" : ""}`}
    >
      <div className="absolute left-4 top-4 z-10 rounded-full bg-white/90 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 shadow">
        {label}
      </div>
      {children}
    </div>
  );
}
