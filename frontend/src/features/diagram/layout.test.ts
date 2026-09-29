import { describe, expect, it } from "vitest";
import { block } from "./model";
import { DEFAULT_WIDTH, MAX_LINE, MIN_BRANCH, layoutDiagram } from "./layout";
describe("content-aware diagram layout", () => {
  it("keeps ordinary diagrams symmetric at the default width", () => {
    const choice = {
      ...block("if", "x == 10"),
      children: [block("statement", "print(x)")],
    };
    const layout = layoutDiagram([choice]);
    expect(layout.width).toBe(DEFAULT_WIDTH);
    expect(layout.blocks.get(choice.id)).toMatchObject({
      left: 300,
      right: 300,
      asymmetric: false,
    });
  });
  it("wraps long text instead of growing an unbounded paper", () => {
    const layout = layoutDiagram([
      block("statement", 'print("' + "long message ".repeat(100) + '")'),
    ]);
    expect(layout.width).toBe(MAX_LINE);
  });
  it("keeps the empty side small once a symmetric fork would exceed twice the default", () => {
    const choice = {
      ...block("if", "x"),
      children: [block("statement", "a".repeat(400))],
    };
    const layout = layoutDiagram([choice]);
    const size = layout.blocks.get(choice.id)!;
    expect(size.asymmetric).toBe(true);
    expect(size.right).toBe(MIN_BRANCH);
    expect(size.left).toBe(MAX_LINE);
    expect(layout.width).toBe(MAX_LINE + MIN_BRANCH);
  });
  it("grows linearly for deeply nested one-sided branches and aligns every split", () => {
    let choice = block("statement", "text".repeat(200));
    for (let i = 0; i < 8; i++)
      choice = { ...block("if", "x > " + i), children: [choice] };
    const layout = layoutDiagram([choice]);
    expect(layout.width).toBe(MAX_LINE + 8 * MIN_BRANCH);
    for (const size of layout.blocks.values())
      if (size.asymmetric) {
        expect(size.left + size.right).toBeCloseTo(size.width);
        expect(size.right).toBeGreaterThanOrEqual(MIN_BRANCH - 0.001);
      }
  });
});
