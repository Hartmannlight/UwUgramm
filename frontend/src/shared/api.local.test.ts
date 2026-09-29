import { afterEach, expect, it, vi } from "vitest";
import { api } from "./api";

vi.mock("./config", () => ({ cloudEnabled: false }));
afterEach(() => vi.unstubAllGlobals());
it("blocks accidental cloud requests in a local instance before calling fetch", async () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  await expect(api("/projects", "POST", {})).rejects.toThrow("deaktiviert");
  expect(fetch).not.toHaveBeenCalled();
});
