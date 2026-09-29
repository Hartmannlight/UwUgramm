// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useWorkspace } from "./useWorkspace";
import { makeProject } from "./model";
import { api } from "../../shared/api";

vi.mock("../../shared/api", () => ({ api: vi.fn(), setCsrf: vi.fn() }));
const notify = vi.fn();
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.clearAllMocks();
  vi.mocked(api).mockResolvedValue({ authenticated: false });
});
afterEach(cleanup);

it("limits new local projects without losing them after reloading", () => {
  const first = renderHook(() => useWorkspace(notify));
  act(() => {
    for (let i = 0; i < 100; i++) first.result.current.add(makeProject());
  });
  expect(first.result.current.projects).toHaveLength(100);
  const ids = first.result.current.projects.map((p) => p.id);
  first.unmount();
  const second = renderHook(() => useWorkspace(notify));
  expect(second.result.current.projects.map((p) => p.id)).toEqual(ids);
});

it("recovers legacy local lists above the creation limit", () => {
  const stored = Array.from({ length: 101 }, () => makeProject());
  localStorage.setItem("uwugramm.projects.v1", JSON.stringify(stored));
  const { result } = renderHook(() => useWorkspace(notify));
  expect(result.current.projects.map((p) => p.id)).toEqual(
    stored.map((p) => p.id),
  );
  act(() => result.current.add());
  expect(result.current.projects).toHaveLength(101);
  expect(notify).toHaveBeenCalledWith(expect.stringContaining("100"));
});

it.each([false, true])(
  "keeps an upload and newer edits while initial cloud loading finishes (empty: %s)",
  async (empty) => {
    let resolveFolders!: (value: unknown) => void;
    const existing = { ...makeProject(), id: "existing-cloud", cloud: true };
    vi.mocked(api).mockImplementation((path, method) => {
      if (path === "/session")
        return Promise.resolve({
          authenticated: true,
          user_id: "alice",
          csrf: "csrf",
        });
      if (path === "/folders")
        return new Promise((resolve) => {
          resolveFolders = resolve;
        });
      if (path === "/projects" && method !== "POST")
        return Promise.resolve(empty ? [] : [existing]);
      if (path === "/projects" && method === "POST")
        return Promise.resolve({
          ...makeProject(),
          id: "uploaded",
          revision: 1,
        });
      throw new Error(path);
    });
    const { result } = renderHook(() => useWorkspace(notify));
    await waitFor(() =>
      expect(result.current.session.authenticated).toBe(true),
    );
    await act(async () => {
      await result.current.save();
    });
    act(() => result.current.rename("Newer unsaved title"));
    expect(
      JSON.parse(sessionStorage.getItem("uwugramm.drafts.alice")!)[0].title,
    ).toBe("Newer unsaved title");
    await act(async () => {
      resolveFolders([]);
    });
    expect(result.current.active.id).toBe("uploaded");
    expect(result.current.active.title).toBe("Newer unsaved title");
    expect(result.current.active.dirty).toBe(true);
    expect(result.current.projects.map((p) => p.id)).toEqual(
      empty ? ["uploaded"] : ["uploaded", "existing-cloud"],
    );
    const drafts = JSON.parse(sessionStorage.getItem("uwugramm.drafts.alice")!);
    expect(drafts[0].title).toBe("Newer unsaved title");
  },
);

it("does not restore deleted cloud projects from an older bootstrap response", async () => {
  const cloud = { ...makeProject(), id: "cloud-id", cloud: true };
  let resolveFolders!: (value: unknown) => void;
  vi.mocked(api).mockImplementation((path, method) => {
    if (path === "/session")
      return Promise.resolve({ authenticated: true, user_id: "alice" });
    if (path === "/folders")
      return new Promise((resolve) => {
        resolveFolders = resolve;
      });
    if (path === "/projects") return Promise.resolve([cloud]);
    if (method === "DELETE") return Promise.resolve({ ok: true });
    throw new Error(path);
  });
  const { result } = renderHook(() => useWorkspace(notify));
  await waitFor(() => expect(result.current.session.authenticated).toBe(true));
  act(() => result.current.add(cloud));
  await act(async () => {
    await result.current.remove();
  });
  await act(async () => {
    resolveFolders([]);
  });
  expect(result.current.projects.some((p) => p.id === cloud.id)).toBe(false);
  expect(result.current.projects).toHaveLength(1);
});

it("ignores pending cloud loading after logout", async () => {
  let resolveFolders!: (value: unknown) => void;
  vi.mocked(api).mockImplementation((path) => {
    if (path === "/session")
      return Promise.resolve({ authenticated: true, user_id: "alice" });
    if (path === "/folders")
      return new Promise((resolve) => {
        resolveFolders = resolve;
      });
    if (path === "/projects")
      return Promise.resolve([{ ...makeProject(), cloud: true }]);
    if (path === "/auth/logout") return Promise.resolve({ ok: true });
    throw new Error(path);
  });
  const { result } = renderHook(() => useWorkspace(notify));
  await waitFor(() => expect(result.current.session.authenticated).toBe(true));
  await act(async () => {
    await result.current.logout();
  });
  await act(async () => {
    resolveFolders([]);
  });
  expect(result.current.session.authenticated).toBe(false);
  expect(result.current.projects.every((p) => !p.cloud)).toBe(true);
  expect(sessionStorage.getItem("uwugramm.drafts.alice")).toBeNull();
});

it("keeps undo and redo isolated to the active project", () => {
  const { result } = renderHook(() => useWorkspace(notify));
  const original = result.current.active.document;
  const changed = { ...original, nodes: [] };
  act(() => result.current.changeDocument(changed));
  act(() => result.current.undo());
  expect(result.current.active.document).toBe(original);
  act(() => result.current.redo());
  expect(result.current.active.document).toBe(changed);
  act(() => result.current.add());
  expect(result.current.history.past).toHaveLength(0);
  act(() => result.current.undo());
  expect(result.current.active.document.nodes).toHaveLength(1);
});

it("keeps other edits and the selected project after a delayed cloud deletion", async () => {
  const { result } = renderHook(() => useWorkspace(notify));
  const localId = result.current.active.id;
  const cloud = { ...makeProject(), id: "cloud-id", cloud: true };
  act(() => result.current.add(cloud));
  let finishDelete!: (value: unknown) => void;
  vi.mocked(api).mockImplementation(
    () =>
      new Promise((resolve) => {
        finishDelete = resolve;
      }),
  );
  let deleting!: Promise<void>;
  act(() => {
    deleting = result.current.remove();
  });
  act(() => result.current.select(localId));
  act(() => result.current.rename("Changed during deletion"));
  act(() => result.current.add());
  const selected = result.current.active.id;
  await act(async () => {
    finishDelete({ ok: true });
    await deleting;
  });
  expect(result.current.projects.find((p) => p.id === localId)?.title).toBe(
    "Changed during deletion",
  );
  expect(result.current.projects.some((p) => p.id === cloud.id)).toBe(false);
  expect(result.current.active.id).toBe(selected);
});
