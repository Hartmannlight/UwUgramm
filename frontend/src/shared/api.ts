export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}
let csrfToken = "";
export function setCsrf(value: string) {
  csrfToken = value;
}
export async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch("/api" + path, {
      method,
      signal: AbortSignal.timeout(15000),
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": csrfToken,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(
      "Der Server ist nicht erreichbar. Deine Änderungen bleiben in diesem Tab erhalten.",
      0,
    );
  }
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = result.detail;
    const message =
      typeof detail === "string"
        ? detail
        : detail?.error
          ? `${detail.line ? "Zeile " + detail.line + ": " : ""}${detail.error}`
          : "Der Server ist gerade nicht verfügbar.";
    throw new ApiError(message, response.status);
  }
  return result;
}
export function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
