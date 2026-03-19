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

const views = [
  { id: "view1", label: "화면 1" },
  { id: "view2", label: "화면 2" },
  { id: "view3", label: "화면 3" },
  { id: "view4", label: "화면 4" }
];

function ViewContent({
  viewId,
  videoRef,
  lastSynced,
  onTimeUpdate
}: {
  viewId: string;
  videoRef: RefObject<HTMLVideoElement>;
  lastSynced: string | null;
  onTimeUpdate: (time: number) => void;
}) {
  if (viewId === "view1") {
    return <VideoPanel videoRef={videoRef} onTimeUpdate={onTimeUpdate} />;
  }
  return <PlaceholderPanel status={lastSynced} />;
}

export default function ViewGrid({
  activeView,
  onActivate,
  videoRef,
  lastSynced,
  onTimeUpdate
}: ViewGridProps) {
  const activeViewData = views.find((v) => v.id === activeView) ?? views[0];
  const thumbnails = views.filter((v) => v.id !== activeViewData.id);

  return (
    <div className="grid h-full grid-cols-[1fr_260px] gap-3">
      <ViewPanel
        label={activeViewData.label}
        isActive={true}
        isThumbnail={false}
        onActivate={() => onActivate(activeViewData.id)}
      >
        <ViewContent
          viewId={activeViewData.id}
          videoRef={videoRef}
          lastSynced={lastSynced}
          onTimeUpdate={onTimeUpdate}
        />
      </ViewPanel>
      <div className="flex flex-col gap-3">
        {thumbnails.map((view) => (
          <ViewPanel
            key={view.id}
            label={view.label}
            isActive={false}
            isThumbnail={true}
            onActivate={() => onActivate(view.id)}
          >
            <ViewContent
              viewId={view.id}
              videoRef={videoRef}
              lastSynced={lastSynced}
              onTimeUpdate={onTimeUpdate}
            />
          </ViewPanel>
        ))}
      </div>
    </div>
  );
}
