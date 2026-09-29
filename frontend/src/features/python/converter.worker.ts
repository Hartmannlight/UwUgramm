/** Runs only the trusted parser. Submitted Python is parsed/compiled, never executed. */
interface PythonRuntime {
  FS: {
    mkdirTree: (path: string) => void;
    writeFile: (path: string, content: string) => void;
  };
  loadPackage: (name: string) => Promise<void>;
  runPython: (source: string) => string;
  globals: {
    set: (name: string, value: string) => void;
    delete: (name: string) => void;
  };
}
const scope = globalThis as unknown as {
  location: Location;
  postMessage: (value: unknown) => void;
  onmessage: (event: MessageEvent<{ id: number; input: string }>) => void;
};
const base = new URL(
  import.meta.env.BASE_URL + "python/",
  scope.location.origin,
).href;

async function initialize(): Promise<PythonRuntime> {
  const { loadPyodide } = await import(/* @vite-ignore */ base + "pyodide.mjs");
  const runtime: PythonRuntime = await loadPyodide({ indexURL: base });
  await runtime.loadPackage("pydantic");
  runtime.FS.mkdirTree("/app/conversion");
  for (const path of [
    "app/__init__.py",
    "app/schema.py",
    "app/conversion/__init__.py",
    "app/conversion/parser.py",
    "app/conversion/type_names.py",
  ]) {
    const response = await fetch(base + path);
    if (!response.ok)
      throw new Error("Parser-Datei konnte nicht geladen werden.");
    runtime.FS.writeFile("/" + path, await response.text());
  }
  runtime.runPython(`
import json, sys
sys.path.insert(0, "/")
from app.schema import Document, PythonSource
from app.conversion.parser import parse_python, export_python, ConversionError
from pydantic import ValidationError
def convert_request(raw):
    try:
        payload = json.loads(raw)
        if "source" in payload:
            source = PythonSource.model_validate(payload).source
            result = parse_python(source)
        else:
            result = {"source": export_python(Document.model_validate(payload["document"]))}
        return json.dumps({"result": result}, ensure_ascii=False)
    except ConversionError as error:
        prefix = "Zeile " + str(error.line) + ": " if error.line else ""
        return json.dumps({"error": prefix + str(error)}, ensure_ascii=False)
    except ValidationError:
        return json.dumps({"error": "Ungültige Daten. Prüfe Textlänge, Diagrammtiefe und Blockstruktur."})
`);
  scope.postMessage({ ready: true });
  return runtime;
}

let runtime: Promise<PythonRuntime> | undefined;
// Initialization is shared; synchronous Python calls cannot overlap in this worker.
scope.onmessage = async ({ data: { id, input } }) => {
  try {
    runtime ??= initialize();
    const python = await runtime;
    python.globals.set("_request_json", input);
    try {
      const response = JSON.parse(
        python.runPython("convert_request(_request_json)"),
      );
      scope.postMessage({ id, ...response });
    } finally {
      python.globals.delete("_request_json");
    }
  } catch {
    runtime = undefined;
    scope.postMessage({
      id,
      error:
        "Der lokale Python-Parser konnte nicht geladen werden. Bitte lade die Seite neu oder versuche es erneut.",
    });
  }
};

export {};
