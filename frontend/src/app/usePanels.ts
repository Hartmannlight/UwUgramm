import { useEffect, useRef, useState } from "react";
import type { PointerEvent, KeyboardEvent } from "react";

function stored(key: string, fallback: number) {
  try {
    const value = Number(localStorage.getItem(key));
    return value > 0 && Number.isFinite(value) ? value : fallback;
  } catch {
    return fallback;
  }
}
function visible(key: string, fallback: boolean) {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : value === "true";
  } catch {
    return fallback;
  }
}
export function usePanels() {
  const split = useRef<HTMLDivElement>(null);
  const [sideOpen, setSideOpen] = useState(() =>
    visible("uwugramm.sidebar", window.innerWidth > 1000),
  );
  const [codeOpen, setCodeOpen] = useState(() =>
    visible("uwugramm.python", true),
  );
  const [vertical, setVertical] = useState(
    () => matchMedia("(max-width: 760px)").matches,
  );
  const [width, setWidth] = useState(() => stored("uwugramm.pythonWidth", 360));
  const [height, setHeight] = useState(() =>
    stored("uwugramm.pythonHeight", 230),
  );
  const [extent, setExtent] = useState(1000);
  const [resizing, setResizing] = useState(false);
  const initial = useRef({ coordinate: 0, size: 0 });
  const minimum = vertical ? 120 : 240;
  const maximum = Math.max(
    minimum,
    Math.min(vertical ? 600 : 960, extent - (vertical ? 140 : 180)),
  );
  const size = Math.min(maximum, Math.max(minimum, vertical ? height : width));
  const resize = (value: number) =>
    (vertical ? setHeight : setWidth)(
      Math.min(maximum, Math.max(minimum, value)),
    );
  useEffect(() => {
    const media = matchMedia("(max-width: 760px)");
    const update = () => setVertical(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    const element = split.current;
    if (!element) return;
    const observer = new ResizeObserver(() =>
      setExtent(vertical ? element.clientHeight : element.clientWidth),
    );
    observer.observe(element);
    setExtent(vertical ? element.clientHeight : element.clientWidth);
    return () => observer.disconnect();
  }, [vertical]);
  useEffect(() => {
    try {
      localStorage.setItem("uwugramm.sidebar", String(sideOpen));
      localStorage.setItem("uwugramm.python", String(codeOpen));
      localStorage.setItem("uwugramm.pythonWidth", String(width));
      localStorage.setItem("uwugramm.pythonHeight", String(height));
    } catch {}
  }, [sideOpen, codeOpen, width, height]);
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    initial.current = {
      coordinate: vertical ? event.clientY : event.clientX,
      size,
    };
    setResizing(true);
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      resize(
        initial.current.size -
          ((vertical ? event.clientY : event.clientX) -
            initial.current.coordinate),
      );
  };
  const stop = (event: PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    setResizing(false);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const smaller = vertical ? "ArrowDown" : "ArrowRight",
      larger = vertical ? "ArrowUp" : "ArrowLeft";
    if ([smaller, larger, "Home", "End"].includes(event.key)) {
      event.preventDefault();
      resize(
        event.key === "Home"
          ? minimum
          : event.key === "End"
            ? maximum
            : size + (event.key === larger ? 24 : -24),
      );
    }
    if (event.key === "Enter") {
      event.preventDefault();
      setCodeOpen(false);
      document.getElementById("python-toggle")?.focus();
    }
  };
  return {
    split,
    sideOpen,
    setSideOpen,
    codeOpen,
    setCodeOpen,
    size,
    vertical,
    resizing,
    separator: {
      onPointerDown,
      onPointerMove,
      onPointerUp: stop,
      onPointerCancel: stop,
      onLostPointerCapture: () => setResizing(false),
      onKeyDown,
      role: "separator",
      tabIndex: 0,
      "aria-label": "Größe des Python-Bereichs ändern",
      "aria-orientation": vertical
        ? ("horizontal" as const)
        : ("vertical" as const),
      "aria-valuemin": minimum,
      "aria-valuemax": maximum,
      "aria-valuenow": Math.round(size),
      "aria-controls": "python-panel",
    },
  };
}
