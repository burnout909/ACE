"use client";

import { useCallback, useEffect, useRef } from "react";

type DragHandleProps = {
  direction: "horizontal" | "vertical";
  onDrag: (delta: number) => void;
};

export default function DragHandle({ direction, onDrag }: DragHandleProps) {
  const dragging = useRef(false);
  const lastPos = useRef(0);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragging.current = true;
      lastPos.current = direction === "horizontal" ? e.clientX : e.clientY;
      document.body.style.cursor =
        direction === "horizontal" ? "col-resize" : "row-resize";
      document.body.style.userSelect = "none";
    },
    [direction]
  );

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      const pos = direction === "horizontal" ? e.clientX : e.clientY;
      const delta = pos - lastPos.current;
      lastPos.current = pos;
      onDrag(delta);
    };

    const handleMouseUp = () => {
      if (!dragging.current) return;
      dragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [direction, onDrag]);

  const isHorizontal = direction === "horizontal";

  return (
    <div
      onMouseDown={handleMouseDown}
      className={`group relative z-20 flex-shrink-0 ${
        isHorizontal
          ? "w-2 cursor-col-resize"
          : "h-2 cursor-row-resize"
      }`}
    >
      <div
        className={`absolute rounded-full bg-slate-300 transition-colors group-hover:bg-slate-400 group-active:bg-yonsei-400 ${
          isHorizontal
            ? "left-1/2 top-1/2 h-8 w-1 -translate-x-1/2 -translate-y-1/2"
            : "left-1/2 top-1/2 h-1 w-8 -translate-x-1/2 -translate-y-1/2"
        }`}
      />
    </div>
  );
}
