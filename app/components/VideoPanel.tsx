import type { RefObject } from "react";

type VideoPanelProps = {
  src?: string;
  videoRef: RefObject<HTMLVideoElement>;
  onTimeUpdate: (time: number) => void;
};

export default function VideoPanel({ src, videoRef, onTimeUpdate }: VideoPanelProps) {
  return (
    <div className="flex h-full items-center justify-center rounded-xl bg-slate-950">
      <video
        ref={videoRef}
        src={src}
        className="h-full w-full rounded-xl object-cover"
        controls
        playsInline
        preload="metadata"
        onTimeUpdate={(event) => onTimeUpdate(event.currentTarget.currentTime)}
      >
        Your browser does not support the video tag.
      </video>
    </div>
  );
}
