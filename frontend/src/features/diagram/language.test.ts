import { describe, expect, it } from "vitest";
import {
  identifierAt,
  identifiers,
  joinSignature,
  pythonText,
  splitSignature,
} from "./language";
describe("typed editor syntax", () => {
  it.each([
    ["x: GZ", "statement", "x: int"],
    ["preis: RZ = 2.5", "statement", "preis: float = 2.5"],
    ['name: ZK = "GZ"', "statement", 'name: str = "GZ"'],
    ["bereit: WW = True", "statement", "bereit: bool = True"],
    ["werte: Liste[GZ] = []", "statement", "werte: list[int] = []"],
    [
      "werte: dict[ZK, Liste[GZ]] = {}",
      "statement",
      "werte: dict[str, list[int]] = {}",
    ],
    ["größe: GZ = 3", "statement", "größe: int = 3"],
    [
      'f(x: GZ, text: ZK = "GZ", *, ok: WW = True) -> RZ',
      "function",
      'f(x: int, text: str = "GZ", *, ok: bool = True) -> float',
    ],
    ["f(x: GZ): GZ", "function", "f(x: int) -> int"],
    ["f() -> void", "function", "f() -> None"],
    ["f(x = lambda y: GZ) -> GZ", "function", "f(x = lambda y: GZ) -> int"],
    ["x: Literal[GZ] = GZ", "statement", "x: Literal[GZ] = GZ"],
    ["x: Annotated[GZ, ZK]", "statement", "x: Annotated[int, ZK]"],
    ["x: package.GZ", "statement", "x: package.GZ"],
    ["x: GZ.Record", "statement", "x: GZ.Record"],
    ['GZ = "GZ"', "statement", 'GZ = "GZ"'],
    ["x: Kunde", "statement", "x: Kunde"],
    ["x = pruefe(wert=10) and y ≤ 3", "if", "x == pruefe(wert=10) and y <= 3"],
    ["not (x = 1) and (y := 2) ≠ 0", "while", "not (x == 1) and (y := 2) != 0"],
    ['x = f"{y=}"', "if", 'x == f"{y=}"'],
  ])("normalizes only annotations in %s", (input, kind, expected) =>
    expect(pythonText(input, kind)).toBe(expected),
  );
  it("preserves nested defaults and optional versus explicitly empty return types", () => {
    const text =
      'f(x: dict[str, int] = {"a": 1}, pair=(1, 2)) -> tuple[int, int]';
    expect(joinSignature(splitSignature(text))).toBe(text);
    expect(splitSignature("f()").returns).toBe("");
    expect(splitSignature("f() -> None").returns).toBe("None");
    expect(pythonText("", "function")).toBe("");
  });
  it("matches whole identifiers, excluding strings, comments, types and properties", () => {
    const source =
      'x: GZ = x + xyz\nprint("x", x) # x\nobj.x = 1\ndef f(x: GZ) -> GZ:';
    expect(identifiers(source).filter((t) => t.text === "x")).toHaveLength(4);
    expect(identifiers(source).some((t) => t.text === "GZ")).toBe(false);
    expect(identifierAt("x + xyz", 5)).toBe("xyz");
    expect(identifierAt('"x"', 1)).toBe("");
    expect(identifiers('print(f"Wert: {x:.2f}")').map((t) => t.text)).toEqual([
      "x",
    ]);
    expect(identifiers("x = 1e3 # x").map((t) => t.text)).toEqual(["x"]);
  });
});
