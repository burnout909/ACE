import type { RefObject } from "react";
import ViewPanel from "./ViewPanel";
import VideoPanel from "./VideoPanel";
import PlaceholderPanel from "./PlaceholderPanel";

type ViewGridProps = {
  activeView: string;
  onActivate: (viewId: string) => void;
  videoRef: RefObject<HTMLVideoElement>;
  lastSynced: string | null;
  onTimeUpdate: (time: number) => void;
};

export default function ViewGrid({
  activeView,
  onActivate,
  videoRef,
  lastSynced,
  onTimeUpdate
}: ViewGridProps) {
  return (
    <div className="grid h-[540px] grid-cols-2 grid-rows-2 gap-4">
      <ViewPanel
        label="View 1"
        isActive={activeView === "view1"}
        onActivate={() => onActivate("view1")}
      >
        <VideoPanel videoRef={videoRef} onTimeUpdate={onTimeUpdate} />
      </ViewPanel>
      <ViewPanel
        label="View 2"
        isActive={activeView === "view2"}
        onActivate={() => onActivate("view2")}
      >
        <PlaceholderPanel status={lastSynced} />
      </ViewPanel>
      <ViewPanel
        label="View 3"
        isActive={activeView === "view3"}
        onActivate={() => onActivate("view3")}
      >
        <PlaceholderPanel status={lastSynced} />
      </ViewPanel>
      <ViewPanel
        label="View 4"
        isActive={activeView === "view4"}
        onActivate={() => onActivate("view4")}
      >
        <PlaceholderPanel status={lastSynced} />
      </ViewPanel>
    </div>
  );
}
