type Pending = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};
let worker: Worker | undefined;
let ready = false;
let sequence = 0;
const pending = new Map<number, Pending>();

function stop(message: string) {
  worker?.terminate();
  worker = undefined;
  ready = false;
  for (const request of pending.values()) {
    clearTimeout(request.timer);
    request.reject(new Error(message));
  }
  pending.clear();
}

function start(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL("./converter.worker.ts", import.meta.url), {
    type: "module",
  });
  worker.onerror = () =>
    stop(
      "Der lokale Python-Parser konnte nicht geladen werden. Bitte versuche es erneut.",
    );
  worker.onmessage = ({ data }) => {
    if (data.ready) {
      ready = true;
      return;
    }
    const request = pending.get(data.id);
    if (!request) return;
    clearTimeout(request.timer);
    pending.delete(data.id);
    if (data.error) request.reject(new Error(data.error));
    else request.resolve(data.result);
  };
  return worker;
}

export function localConversion<T>(payload: unknown): Promise<T> {
  const input = JSON.stringify(payload);
  if (new TextEncoder().encode(input).byteLength > 262_144)
    return Promise.reject(new Error("Maximal 256 KB pro Konvertierung."));
  const active = start();
  const id = ++sequence;
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () =>
        stop(
          "Der lokale Python-Parser hat zu lange gebraucht. Bitte versuche es erneut oder vereinfache den Code.",
        ),
      ready ? 10_000 : 60_000,
    );
    pending.set(id, { resolve: (value) => resolve(value as T), reject, timer });
    active.postMessage({ id, input });
  });
}
