import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";

export function useCanvasZoom(canvas: RefObject<HTMLDivElement | null>) {
  const [zoom, setZoom] = useState(1);
  const zoomRef = useRef(1);
  const zoomAt = useCallback(
    (next: number, x?: number, y?: number) => {
      const element = canvas.current;
      if (!element) return;
      const rect = element.getBoundingClientRect();
      const localX = x === undefined ? element.clientWidth / 2 : x - rect.left;
      const localY = y === undefined ? element.clientHeight / 2 : y - rect.top;
      const padX = parseFloat(getComputedStyle(element).paddingLeft) || 0;
      const padY = parseFloat(getComputedStyle(element).paddingTop) || 0;
      const old = zoomRef.current;
      const value = Math.max(0.35, Math.min(2.5, next));
      const anchorX = (element.scrollLeft + localX - padX) / old;
      const anchorY = (element.scrollTop + localY - padY) / old;
      zoomRef.current = value;
      setZoom(value);
      requestAnimationFrame(() => {
        element.scrollLeft = anchorX * value + padX - localX;
        element.scrollTop = anchorY * value + padY - localY;
      });
    },
    [canvas],
  );
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const wheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const unit =
        event.deltaMode === 1
          ? 16
          : event.deltaMode === 2
            ? element.clientHeight
            : 1;
      zoomAt(
        zoomRef.current * Math.exp(-event.deltaY * unit * 0.002),
        event.clientX,
        event.clientY,
      );
    };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => element.removeEventListener("wheel", wheel);
  }, [canvas, zoomAt]);
  return { zoom, zoomAt };
}
