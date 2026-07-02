"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import type { CaseVideoUrls } from "@/lib/types";
import { needsCorrection } from "@/lib/sync";
import { logEvent } from "@/lib/events/client";

type MultiViewPanelProps = {
  videoUrls: CaseVideoUrls;
  onTimeUpdate: (time: number) => void;
  // Lets the parent seek the active master (transcript/evidence timestamp jumps).
  registerSeek?: (fn: (seconds: number) => void) => void;
};

const VIEW_META: { id: keyof CaseVideoUrls; label: string }[] = [
  { id: "ceiling", label: "천장" },
  { id: "bed", label: "침상" },
  { id: "evaluator", label: "평가자" },
];

// N-view lockstep player. The active view is large, has controls + audio, and
// is the sync master; the rest are muted thumbnails that follow it (play/pause/
// seek mirror + >0.15s drift correction). Clicking a thumbnail promotes it to
// master without interrupting playback (all elements stay mounted).
export default function MultiViewPanel({ videoUrls, onTimeUpdate, registerSeek }: MultiViewPanelProps) {
  const views = VIEW_META.filter((v) => !!videoUrls[v.id]);
  const refs = useRef<Record<string, HTMLVideoElement | null>>({});
  const [activeId, setActiveId] = useState<string>(views[0]?.id ?? "ceiling");

  // Re-bind sync + event logging whenever the master (active view) changes.
  useEffect(() => {
    const master = refs.current[activeId];
    if (!master) return;
    const others = () =>
      Object.entries(refs.current)
        .filter(([id, el]) => id !== activeId && el)
        .map(([, el]) => el as HTMLVideoElement);

    const onPlay = () => { logEvent("play", { currentTime: master.currentTime }); others().forEach((s) => { s.currentTime = master.currentTime; void s.play().catch(() => {}); }); };
    const onPause = () => { logEvent("pause", { currentTime: master.currentTime }); others().forEach((s) => s.pause()); };
    const onSeeked = () => { logEvent("seek", { seekedTo: master.currentTime }); others().forEach((s) => { s.currentTime = master.currentTime; }); };
    const onRate = () => { logEvent("ratechange_attempt", { rate: master.playbackRate }); others().forEach((s) => { s.playbackRate = master.playbackRate; }); };
    const onTime = () => {
      onTimeUpdate(master.currentTime);
      others().forEach((s) => { if (needsCorrection(master.currentTime, s.currentTime)) s.currentTime = master.currentTime; });
    };

    master.addEventListener("play", onPlay);
    master.addEventListener("pause", onPause);
    master.addEventListener("seeked", onSeeked);
    master.addEventListener("ratechange", onRate);
    master.addEventListener("timeupdate", onTime);
    return () => {
      master.removeEventListener("play", onPlay);
      master.removeEventListener("pause", onPause);
      master.removeEventListener("seeked", onSeeked);
      master.removeEventListener("ratechange", onRate);
      master.removeEventListener("timeupdate", onTime);
    };
  }, [activeId, onTimeUpdate]);

  // Expose a seek that drives the current master (slaves follow via onSeeked).
  useEffect(() => {
    registerSeek?.((seconds: number) => {
      const master = refs.current[activeId];
      if (!master) return;
      master.currentTime = seconds;
      void master.play().catch(() => {});
    });
  }, [activeId, registerSeek]);

  function swapTo(id: string) {
    const cur = refs.current[activeId];
    const next = refs.current[id];
    if (next && cur) next.currentTime = cur.currentTime; // keep position on promote
    setActiveId(id);
  }

  // Videos are rendered in a FIXED order (stable DOM → no remount/reload on
  // swap); only CSS grid placement changes. Active = large left column spanning
  // all rows; thumbnails stack in the right column.
  const thumbRows = Math.max(1, views.length - 1);
  let thumbSeen = 0;

  return (
    <div
      className="grid h-full gap-3"
      style={{ gridTemplateColumns: "1fr 240px", gridTemplateRows: `repeat(${thumbRows}, 1fr)` }}
    >
      {views.map((v) => {
        const isActive = v.id === activeId;
        const placement: React.CSSProperties = isActive
          ? { gridColumn: 1, gridRow: "1 / -1" }
          : { gridColumn: 2, gridRow: `${++thumbSeen}` };
        return (
          <figure
            key={v.id}
            style={placement}
            className={`relative m-0 min-h-0 overflow-hidden rounded-xl bg-slate-950 ${
              isActive ? "" : "cursor-pointer ring-1 ring-slate-200 hover:ring-2 hover:ring-yonsei-400"
            }`}
            onClick={isActive ? undefined : () => swapTo(v.id)}
          >
            <span className="absolute left-2 top-2 z-10 rounded-md bg-black/50 px-2 py-0.5 text-xs font-medium text-white">
              {v.label}
            </span>
            <video
              ref={(el) => { refs.current[v.id] = el; }}
              src={videoUrls[v.id]}
              className="h-full w-full object-cover"
              controls={isActive}
              muted={!isActive}
              playsInline
              preload="metadata"
            />
          </figure>
        );
      })}
    </div>
  );
}
