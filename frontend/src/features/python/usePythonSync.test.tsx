// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { block } from "../diagram/model";
import type { Diagram } from "../diagram/model";
import { usePythonSync } from "./usePythonSync";
import type { Conversion, ParsePython } from "./usePythonSync";
const doc = (text: string): Diagram => ({
  version: 1,
  nodes: [block("statement", text)],
});
const parsed = (text: string): Conversion => ({
  document: doc(text),
  warnings: [],
});
const delay = () =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(500);
  });
function harness(parse: ParsePython) {
  return renderHook(() => {
    const [document, setDocument] = useState(doc("x = 1"));
    return {
      ...usePythonSync("a", document, setDocument, parse),
      document,
      setDocument,
    };
  });
}
describe("automatic Python synchronization", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });
  it("imports valid Python and regenerates code immediately after the next diagram edit", async () => {
    const parse = vi.fn<ParsePython>().mockResolvedValue(parsed("x = 2"));
    const { result } = harness(parse);
    act(() => result.current.edit("x=2"));
    expect(result.current.locked).toBe(true);
    await delay();
    expect(result.current.document.nodes[0].text).toBe("x = 2");
    expect(result.current.source).toBe("x=2");
    expect(result.current.locked).toBe(false);
    act(() => result.current.setDocument(doc("x = 3")));
    expect(result.current.source).toBe("x = 3\n");
  });
  it("keeps the last valid diagram during invalid Python, then recovers automatically", async () => {
    const parse = vi
      .fn<ParsePython>()
      .mockRejectedValueOnce(new Error("Syntaxfehler"))
      .mockResolvedValueOnce(parsed("x = 4"));
    const { result } = harness(parse);
    act(() => result.current.edit("if :"));
    await delay();
    expect(result.current.error).toBe("Syntaxfehler");
    expect(result.current.document.nodes[0].text).toBe("x = 1");
    expect(result.current.locked).toBe(true);
    act(() => result.current.edit("x=4"));
    await delay();
    expect(result.current.source).toBe("x=4");
    expect(result.current.error).toBe("");
    expect(result.current.locked).toBe(false);
  });
  it("clears the diagram for empty code without needing the API", async () => {
    const parse = vi.fn<ParsePython>();
    const { result } = harness(parse);
    act(() => result.current.edit(""));
    await delay();
    expect(result.current.document.nodes).toHaveLength(0);
    expect(result.current.source).toBe("");
    expect(parse).not.toHaveBeenCalled();
  });
  it("ignores a late conversion after new input or reset", async () => {
    let complete!: (value: Conversion) => void;
    const parse = vi
      .fn<ParsePython>()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            complete = resolve;
          }),
      )
      .mockResolvedValueOnce(parsed("x = 3"));
    const { result } = harness(parse);
    act(() => result.current.edit("x=2"));
    await delay();
    act(() => result.current.edit("x=3"));
    await delay();
    await act(async () => complete(parsed("x = 2")));
    expect(result.current.document.nodes[0].text).toBe("x = 3");
    act(() => result.current.edit("if :"));
    act(() => result.current.reset());
    await delay();
    expect(result.current.source).toBe("x = 3\n");
    expect(result.current.locked).toBe(false);
    expect(parse).toHaveBeenCalledTimes(2);
  });
  it("does not apply a delayed result to another project and preserves unfinished input", async () => {
    let complete!: (value: Conversion) => void;
    const parse = vi.fn<ParsePython>().mockImplementation(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    const apply = vi.fn();
    const first = doc("a = 1");
    const second = doc("b = 1");
    const { result, rerender } = renderHook(
      ({ id, document }) => usePythonSync(id, document, apply, parse),
      { initialProps: { id: "a", document: first } },
    );
    act(() => result.current.edit("a = 2"));
    await delay();
    rerender({ id: "b", document: second });
    await act(async () => complete(parsed("a = 2")));
    expect(apply).not.toHaveBeenCalled();
    expect(result.current.source).toBe("b = 1\n");
    rerender({ id: "a", document: first });
    expect(result.current.source).toBe("a = 2");
    expect(result.current.locked).toBe(true);
  });
});
