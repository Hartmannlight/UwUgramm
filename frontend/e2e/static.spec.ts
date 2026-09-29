import { expect, test } from "@playwright/test";

test("a Pages instance keeps editing, conversion and downloads fully local", async ({
  page,
  context,
  baseURL,
}) => {
  const apiRequests: string[] = [];
  const externalRequests: string[] = [];
  const brokenAssets: string[] = [];
  const errors: string[] = [];
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.includes("/api/")) {
      apiRequests.push(url.pathname);
      return route.abort();
    }
    if (url.origin !== new URL(baseURL!).origin) {
      externalRequests.push(url.href);
      return route.abort();
    }
    return route.continue();
  });
  page.on("response", (response) => {
    if (response.status() >= 400) brokenAssets.push(response.url());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("./");
  await expect(page.getByText("Nur lokal", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Mit Google anmelden" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Teilen", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "UwU-Theme" }).click();
  const sprite = page.locator(".pet-sprite").first();
  await expect(sprite).toBeVisible();
  const spriteUrl = await sprite.evaluate(
    (element) => getComputedStyle(element).backgroundImage,
  );
  expect(spriteUrl).toContain(new URL(baseURL!).pathname);

  await page
    .getByRole("textbox", { name: "Projektname", exact: true })
    .first()
    .fill("Pages-Test");
  const editor = page.locator(".cm-content");
  const source =
    "# ä漢🐾\ndef f(x: GZ) -> GZ:\n    if x > 0:\n        return x\n    else:\n        return 0\n";
  await editor.fill(source);
  await expect(
    page.getByRole("combobox", { name: "Funktion: f", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".python-error")).toHaveCount(0);
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Python herunterladen", exact: true })
    .click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("Pages-Test.py");
  const stream = await file.createReadStream();
  const chunks = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  const exported = Buffer.concat(chunks).toString("utf8");
  expect(exported).toContain("ä漢🐾");
  expect(exported).toContain("def f(x: int) -> int:");

  await editor.fill("x =");
  await expect(page.locator(".python-error")).toBeVisible();
  await expect(
    page.getByRole("combobox", { name: "Funktion: f", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("complementary", { name: "Python-Code" })
    .getByRole("button", { name: "Diagrammcode wiederherstellen" })
    .click();
  await expect(page.locator(".python-error")).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByRole("textbox", { name: "Projektname", exact: true }).first(),
  ).toHaveValue("Pages-Test");
  await expect(
    page.getByRole("combobox", { name: "Funktion: f", exact: true }),
  ).toBeVisible();
  await page
    .locator(".cm-content")
    .fill('raise RuntimeError("must not execute")\n');
  await expect(
    page.getByRole("combobox", { name: /Anweisung: raise RuntimeError/ }),
  ).toBeVisible();
  await expect(page.locator(".python-error")).toHaveCount(0);
  expect(apiRequests).toEqual([]);
  expect(externalRequests).toEqual([]);
  expect(brokenAssets).toEqual([]);
  expect(errors).toEqual([]);
});
