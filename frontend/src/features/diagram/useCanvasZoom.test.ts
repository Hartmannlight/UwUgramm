// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCanvasZoom } from "./useCanvasZoom";
let element: HTMLDivElement;
beforeEach(() => {
  element = document.createElement("div");
  element.style.padding = "20px";
  document.body.append(element);
  element.scrollLeft = 200;
  element.scrollTop = 100;
  Object.defineProperties(element, {
    clientWidth: { value: 800 },
    clientHeight: { value: 600 },
  });
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
});
afterEach(() => {
  cleanup();
  element.remove();
  vi.unstubAllGlobals();
});
describe("canvas wheel controls", () => {
  it("leaves ordinary wheel scrolling to the browser", () => {
    const ref = { current: element };
    const { result } = renderHook(() => useCanvasZoom(ref));
    const event = new WheelEvent("wheel", { deltaY: 100, cancelable: true });
    act(() => {
      element.dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(false);
    expect(result.current.zoom).toBe(1);
  });
  it("zooms on Ctrl+wheel while keeping the diagram point under the cursor", () => {
    const ref = { current: element };
    const { result } = renderHook(() => useCanvasZoom(ref));
    const event = new WheelEvent("wheel", {
      deltaY: -100,
      ctrlKey: true,
      clientX: 300,
      clientY: 200,
      cancelable: true,
    });
    act(() => {
      element.dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(true);
    expect(result.current.zoom).toBeGreaterThan(1);
    expect((element.scrollLeft + 300 - 20) / result.current.zoom).toBeCloseTo(
      480,
    );
    expect((element.scrollTop + 200 - 20) / result.current.zoom).toBeCloseTo(
      280,
    );
  });
  it("clamps extreme zoom and resets to 100 percent", () => {
    const ref = { current: element };
    const { result } = renderHook(() => useCanvasZoom(ref));
    act(() => result.current.zoomAt(100));
    expect(result.current.zoom).toBe(2.5);
    act(() => result.current.zoomAt(0.001));
    expect(result.current.zoom).toBe(0.35);
    act(() => result.current.zoomAt(1));
    expect(result.current.zoom).toBe(1);
  });
});
