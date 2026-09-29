// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useWorkspace } from "./useWorkspace";
import { api } from "../../shared/api";

vi.mock("../../shared/config", () => ({ cloudEnabled: false }));
vi.mock("../../shared/api", () => ({ api: vi.fn(), setCsrf: vi.fn() }));
const notify = vi.fn();
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.clearAllMocks();
});
afterEach(cleanup);

it("persists projects and folders without fetching a session or contacting the API", async () => {
  const first = renderHook(() => useWorkspace(notify));
  expect(first.result.current.session.authenticated).toBe(false);
  act(() => first.result.current.rename("Lokal ohne Server"));
  await act(async () => {
    await first.result.current.createFolder("Unterricht");
  });
  act(() =>
    first.result.current.moveProject(
      first.result.current.active.id,
      first.result.current.folders[0].id,
    ),
  );
  await act(async () => {
    await first.result.current.save();
  });
  const id = first.result.current.active.id;
  first.unmount();
  const restored = renderHook(() => useWorkspace(notify));
  expect(restored.result.current.active.id).toBe(id);
  expect(restored.result.current.active.title).toBe("Lokal ohne Server");
  expect(restored.result.current.folders[0].name).toBe("Unterricht");
  expect(restored.result.current.active.folder_id).toBe(
    restored.result.current.folders[0].id,
  );
  expect(api).not.toHaveBeenCalled();
  expect(notify).not.toHaveBeenCalledWith(expect.stringContaining("Google"));
});

it("reports a failed local save instead of promising cloud storage", async () => {
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("quota");
  });
  try {
    const hook = renderHook(() => useWorkspace(notify));
    await act(async () => {
      await hook.result.current.save();
    });
    expect(hook.result.current.saveState).toContain("Browser-Speicher voll");
    expect(notify).toHaveBeenCalledWith(expect.stringContaining("exportiere"));
    expect(api).not.toHaveBeenCalled();
  } finally {
    vi.restoreAllMocks();
  }
});
