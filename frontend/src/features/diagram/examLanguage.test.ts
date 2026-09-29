import { describe, it, expect } from "vitest";
import { pythonText } from "./language";
describe("classroom spellings preserve literal text", () => {
  it.each([
    ["x: FKZ = 1.0", "statement", "x: float = 1.0"],
    ["x: double", "statement", "x: float"],
    ["x: Liste<FKZ> = []", "statement", "x: list[float] = []"],
    [
      "f(xs: Liste<Liste<GZ>>, x: FKZ = 1) -> Liste<Text>",
      "function",
      "f(xs: list[list[int]], x: float = 1) -> list[str]",
    ],
    ['x = "wahr UND FKZ < GZ>"', "statement", 'x = "wahr UND FKZ < GZ>"'],
    ["x gleich 10 UND nicht fertig DANN", "if", "x == 10 and not fertig"],
    ["x: Boolean ← wahr", "statement", "x: bool = True"],
    ["RÜCKGABE wahr", "statement", "return True"],
    ['AUSGABE "FKZ"', "statement", 'print("FKZ")'],
    ["1, 2", "case", "1 | 2"],
    ["[x, y]", "case", "[x, y]"],
    [
      "i ← 1 BIS 5 SCHRITT 2",
      "for",
      "i in range(1, (5) + (1 if (2) > 0 else -1), 2)",
    ],
  ])("normalizes %s", (text, kind, expected) =>
    expect(pythonText(text, kind)).toBe(expected),
  );
});
