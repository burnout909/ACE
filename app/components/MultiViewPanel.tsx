"use client";

import { useRef, type RefObject } from "react";
import type { CaseVideoUrls } from "@/lib/types";
import { useSyncedVideos } from "./hooks/useSyncedVideos";

type MultiViewPanelProps = {
  videoUrls: CaseVideoUrls;
  masterRef: RefObject<HTMLVideoElement>;
  onTimeUpdate: (time: number) => void;
};

// 3-angle lockstep player. Ceiling (config REFERENCE_VIEW) is the master with
// controls; bedside + evaluator follow it, muted, drift-corrected. All three
// stay mounted so playback never restarts.
export default function MultiViewPanel({ videoUrls, masterRef, onTimeUpdate }: MultiViewPanelProps) {
  const bedRef = useRef<HTMLVideoElement>(null);
  const evalRef = useRef<HTMLVideoElement>(null);
  useSyncedVideos(masterRef, [bedRef, evalRef]);

  return (
    <div className="grid h-full grid-cols-[1fr_260px] gap-3">
      {/* Master: 천장 */}
      <figure className="relative m-0 overflow-hidden rounded-xl bg-slate-950">
        <span className="absolute left-2 top-2 z-10 rounded-md bg-black/50 px-2 py-0.5 text-xs font-medium text-white">
          천장
        </span>
        <video
          ref={masterRef}
          src={videoUrls.ceiling}
          className="h-full w-full object-cover"
          controls
          playsInline
          preload="metadata"
          onTimeUpdate={(e) => onTimeUpdate(e.currentTarget.currentTime)}
        />
      </figure>

      {/* Slaves: 침상 / 평가자 */}
      <div className="flex flex-col gap-3">
        {([
          { label: "침상", src: videoUrls.bed, ref: bedRef },
          { label: "평가자", src: videoUrls.evaluator, ref: evalRef },
        ] as const).map((v) => (
          <figure key={v.label} className="relative m-0 flex-1 overflow-hidden rounded-xl bg-slate-950">
            <span className="absolute left-2 top-2 z-10 rounded-md bg-black/50 px-2 py-0.5 text-xs font-medium text-white">
              {v.label}
            </span>
            {v.src ? (
              <video
                ref={v.ref}
                src={v.src}
                className="h-full w-full object-cover"
                muted
                playsInline
                preload="metadata"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-slate-400">뷰 없음</div>
            )}
          </figure>
        ))}
      </div>
    </div>
  );
}
