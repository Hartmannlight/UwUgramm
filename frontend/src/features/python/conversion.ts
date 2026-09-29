import { api } from "../../shared/api";
import { cloudEnabled } from "../../shared/config";
import type { Diagram } from "../diagram/model";
import type { Conversion } from "./usePythonSync";

async function locally<T>(payload: unknown): Promise<T> {
  const { localConversion } = await import("./localConversion");
  return localConversion<T>(payload);
}

export const fromPython = (source: string): Promise<Conversion> =>
  cloudEnabled
    ? api("/convert/from-python", "POST", { source })
    : locally({ source });

export const exportPython = (document: Diagram): Promise<{ source: string }> =>
  cloudEnabled
    ? api("/convert/to-python", "POST", document)
    : locally({ document });
