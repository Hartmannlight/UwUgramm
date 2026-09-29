import { describe, expect, it } from "vitest";
import { block, toPython, updateBlock } from "./model";
import type { Diagram } from "./model";
import {
  comparison,
  enterLine,
  eraseEmpty,
  locate,
  recognizeTyping,
  switchBranch,
} from "./editing";
const documentOf = (...nodes: Diagram["nodes"]): Diagram => ({
  version: 1,
  nodes,
});

describe("keyboard writing workflow", () => {
  it("recognizes a typed keyword before Enter without stealing variable names", () => {
    const line = block("statement");
    expect(recognizeTyping(line, "if ")).toMatchObject({
      kind: "if",
      text: "",
      id: line.id,
    });
    expect(recognizeTyping(line, "if x == 10")).toMatchObject({
      kind: "if",
      text: "x == 10",
    });
    expect(recognizeTyping(line, "if_count = 2").kind).toBe("statement");
    expect(recognizeTyping(line, "gift = 2").kind).toBe("statement");
  });
  it("leaves an empty No branch and reuses the empty following step", () => {
    const empty = block("statement");
    const choice = {
      ...block("if", "x"),
      otherwise: [empty, block("statement"), block("statement")],
    };
    const next = block("statement");
    const before = documentOf(choice, next);
    const outside = enterLine(before, empty.id);
    expect(outside.focus).toBe(next.id);
    expect(outside.document.nodes[0].otherwise).toHaveLength(0);
    expect(enterLine(outside.document, next.id)).toEqual({
      document: outside.document,
      focus: next.id,
    });
  });
  it("exits the closest enclosing if, not the surrounding loop", () => {
    const empty = block("statement");
    const choice = { ...block("if", "x"), otherwise: [empty] };
    const loop = { ...block("while", "x"), children: [choice] };
    const result = enterLine(documentOf(loop), empty.id);
    expect(locate(result.document, result.focus)?.parent).toBe(loop.id);
    expect(result.document.nodes).toHaveLength(1);
  });
  it("turns typed if into a condition, enters Yes, moves to No and exits inside the enclosing loop", () => {
    const line = block("statement", "if x = 10:");
    const loop = { ...block("while", "x > 0"), children: [line] };
    const yes = enterLine(documentOf(loop), line.id);
    expect(locate(yes.document, line.id)?.node).toMatchObject({
      kind: "if",
      text: "x == 10",
    });
    expect(locate(yes.document, yes.focus)?.parent).toBe(line.id);
    const written = updateBlock(yes.document, yes.focus, (n) => ({
      ...n,
      text: "print(x)",
    }));
    const no = switchBranch(written, yes.focus)!;
    expect(locate(no.document, no.focus)?.branch).toBe("otherwise");
    expect(switchBranch(no.document, no.focus, true)?.focus).toBe(yes.focus);
    const outside = switchBranch(no.document, no.focus)!;
    expect(locate(outside.document, outside.focus)?.parent).toBe(loop.id);
    expect(outside.document.nodes).toHaveLength(1);
    expect(toPython(outside.document)).toBe(
      "while x > 0:\n    if x == 10:\n        print(x)\n",
    );
  });
  it("enters a loop then Alt+Enter leaves its body, preserving following content", () => {
    const line = block("statement", "while x > 0");
    const next = block("statement", 'print("done")');
    const body = enterLine(documentOf(line, next), line.id);
    const result = enterLine(body.document, body.focus, true);
    expect(result.document.nodes.map((n) => n.kind)).toEqual([
      "while",
      "statement",
      "statement",
    ]);
    expect(result.document.nodes[2]).toEqual(next);
  });
  it("Backspace removes empty fields and restores focus without deleting populated containers", () => {
    const condition = { ...block("if", "x"), children: [block("statement")] };
    const cleared = eraseEmpty(
      documentOf(condition),
      condition.children[0].id,
    )!;
    expect(cleared.focus).toBe(condition.id);
    expect(cleared.document.nodes[0].children).toHaveLength(0);
    expect(
      eraseEmpty(documentOf({ ...condition, text: "" }), condition.id),
    ).toBeUndefined();
    const empty = block("statement");
    expect(eraseEmpty(documentOf(empty), empty.id)).toMatchObject({
      focus: "diagram",
      document: { nodes: [] },
    });
  });
  it("does not alter equals signs inside strings or operators", () => {
    expect(comparison('name = "a=b" and x >= 10 and y != 5 and (z := 2)')).toBe(
      'name == "a=b" and x >= 10 and y != 5 and (z := 2)',
    );
  });
  it("only emits pass where Python needs an empty suite", () => {
    expect(
      toPython(documentOf(block("statement"), block("statement", "  "))),
    ).toBe("");
    const condition = {
      ...block("if", "x"),
      children: [
        block("statement"),
        block("statement", "x = 1"),
        block("statement"),
      ],
      otherwise: [block("statement")],
    };
    expect(toPython(documentOf(condition))).toBe("if x:\n    x = 1\n");
    expect(toPython(documentOf(block("while", "x")))).toBe(
      "while x:\n    pass\n",
    );
  });
});
