import { useEffect, type RefObject } from "react";
import { needsCorrection } from "@/lib/sync";

/**
 * Lockstep-sync N video elements to a master (index 0). The master drives
 * play/pause/seek/rate; slaves follow, with drift correction on every
 * timeupdate. Study rule: raters cannot change rate, but we still mirror it
 * defensively so the angles never diverge.
 */
export function useSyncedVideos(
  masterRef: RefObject<HTMLVideoElement | null>,
  slaveRefs: RefObject<HTMLVideoElement | null>[]
) {
  useEffect(() => {
    const master = masterRef.current;
    if (!master) return;
    const slaves = () => slaveRefs.map((r) => r.current).filter((v): v is HTMLVideoElement => !!v);

    const onPlay = () => slaves().forEach((s) => { s.currentTime = master.currentTime; void s.play().catch(() => {}); });
    const onPause = () => slaves().forEach((s) => s.pause());
    const onSeeked = () => slaves().forEach((s) => { s.currentTime = master.currentTime; });
    const onRate = () => slaves().forEach((s) => { s.playbackRate = master.playbackRate; });
    const onTime = () =>
      slaves().forEach((s) => {
        if (needsCorrection(master.currentTime, s.currentTime)) s.currentTime = master.currentTime;
      });

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
