import { useEffect, useMemo, useRef, useState } from "react";
import { fromPython } from "./conversion";
import { toPython } from "../diagram/model";
import type { Diagram } from "../diagram/model";
export interface Conversion {
  document: Diagram;
  warnings: string[];
}
export type ParsePython = (source: string) => Promise<Conversion>;
const parsePython: ParsePython = fromPython;
interface Buffer {
  source: string;
  base: Diagram;
  phase: "pending" | "valid" | "error";
  error?: string;
}

/** Only one side can have unvalidated edits. Stale conversions never touch the document. */
export function usePythonSync(
  project: string,
  document: Diagram,
  apply: (document: Diagram) => void,
  parse: ParsePython = parsePython,
) {
  const [buffers, setBuffers] = useState<Record<string, Buffer>>({});
  const [warning, setWarning] = useState("");
  const latest = useRef({ project, document, apply });
  latest.current = { project, document, apply };
  const request = useRef(0);
  const buffer = buffers[project];
  const generated = useMemo(() => toPython(document), [document]);
  const source =
    buffer && (buffer.phase !== "valid" || buffer.base === document)
      ? buffer.source
      : generated;
  const locked = !!buffer && buffer.phase !== "valid";
  useEffect(() => {
    if (!buffer || buffer.phase !== "pending") return;
    const token = ++request.current;
    const timer = setTimeout(
      async () => {
        try {
          const result = buffer.source.trim()
            ? await parse(buffer.source)
            : { document: { version: 1 as const, nodes: [] }, warnings: [] };
          if (token !== request.current || latest.current.project !== project)
            return;
          if (latest.current.document !== buffer.base)
            throw new Error(
              "Das Projekt wurde zwischenzeitlich geändert. Stelle den aktuellen Diagrammcode wieder her oder sichere deinen Python-Code.",
            );
          latest.current.apply(result.document);
          setBuffers((all) => ({
            ...all,
            [project]: {
              source: buffer.source,
              base: result.document,
              phase: "valid",
            },
          }));
          setWarning(result.warnings.join(" "));
        } catch (error) {
          if (token !== request.current || latest.current.project !== project)
            return;
          setBuffers((all) => ({
            ...all,
            [project]: {
              ...buffer,
              phase: "error",
              error: (error as Error).message,
            },
          }));
        }
      },
      buffer.source.trim() ? 450 : 0,
    );
    return () => {
      clearTimeout(timer);
      request.current++;
    };
  }, [project, buffer, parse]);
  const reset = () => {
    request.current++;
    setWarning("");
    setBuffers((all) => {
      const next = { ...all };
      delete next[project];
      return next;
    });
  };
  const edit = (value: string) => {
    if (value === source) return;
    request.current++;
    setWarning("");
    if (value === generated) {
      reset();
      return;
    }
    setBuffers((all) => ({
      ...all,
      [project]: { source: value, base: document, phase: "pending" },
    }));
  };
  const retry = () => {
    if (buffer)
      setBuffers((all) => ({
        ...all,
        [project]: {
          ...buffer,
          base: document,
          phase: "pending",
          error: undefined,
        },
      }));
  };
  return {
    source,
    edit,
    reset,
    retry,
    locked,
    pending: buffer?.phase === "pending",
    error: buffer?.error || "",
    warning,
    unsaved: Object.values(buffers).some((b) => b.phase !== "valid"),
  };
}
