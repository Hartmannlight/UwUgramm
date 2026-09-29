/** Package Pyodide and the existing backend parser for a completely self-hosted build. */
import { createHash } from "node:crypto";
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const frontend = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = join(frontend, ".local/python");
const runtime = join(frontend, "node_modules/pyodide");
const { version } = JSON.parse(
  await readFile(join(runtime, "package.json"), "utf8"),
);
const lock = JSON.parse(
  await readFile(join(runtime, "pyodide-lock.json"), "utf8"),
);
await mkdir(output, { recursive: true });
for (const name of [
  "pyodide.mjs",
  "pyodide.js",
  "pyodide.asm.mjs",
  "pyodide.asm.wasm",
  "python_stdlib.zip",
  "pyodide-lock.json",
]) {
  await cp(join(runtime, name), join(output, name));
}

const packages = new Map();
function include(name) {
  const normalized = name.toLowerCase().replaceAll("_", "-");
  if (packages.has(normalized)) return;
  const pkg = lock.packages[normalized];
  if (!pkg) throw new Error(`Missing runtime package ${normalized}`);
  packages.set(normalized, pkg);
  pkg.depends.forEach(include);
}
include("pydantic");
for (const pkg of packages.values()) {
  const file = join(output, pkg.file_name);
  const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
  const cached = await readFile(file).catch(() => undefined);
  if (cached && hash(cached) === pkg.sha256) continue;
  const url = `https://cdn.jsdelivr.net/pyodide/v${version}/full/${pkg.file_name}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!response.ok)
    throw new Error(`Runtime download failed: ${pkg.name}: ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (hash(bytes) !== pkg.sha256)
    throw new Error(`Runtime checksum mismatch: ${pkg.name}`);
  await writeFile(file, bytes);
}
for (const file of [
  "__init__.py",
  "schema.py",
  "conversion/__init__.py",
  "conversion/parser.py",
  "conversion/type_names.py",
]) {
  const target = join(output, "app", file);
  await mkdir(dirname(target), { recursive: true });
  await cp(join(frontend, "../backend/app", file), target);
}
console.log(
  `Static Python runtime ${version} prepared (${packages.size} verified packages)`,
);
