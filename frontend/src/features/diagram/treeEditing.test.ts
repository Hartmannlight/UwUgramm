import { describe, it, expect } from "vitest";
import { block, validDiagram, toPython } from "./model";
import type { Diagram } from "./model";
import {
  canMoveTo,
  moveTo,
  enterLine,
  locate,
  recognize,
  recognizeTyping,
} from "./editing";
const doc = (...nodes: Diagram["nodes"]): Diagram => ({ version: 1, nodes });

describe("moving complete subtrees", () => {
  it("moves an if with both branches into another No branch and can move it out again", () => {
    const first = {
      ...block("if", "a"),
      children: [block("statement", "x=1")],
      otherwise: [block("statement", "x=2")],
    };
    const second = block("if", "b");
    const original = doc(first, second);
    const moved = moveTo(original, first.id, {
      parent: second.id,
      branch: "otherwise",
      index: 0,
    });
    expect(moved.nodes).toHaveLength(1);
    expect(moved.nodes[0].otherwise[0]).toEqual(first);
    expect(validDiagram(moved)).toBe(true);
    expect(moveTo(moved, first.id, { index: 1 }).nodes).toEqual([
      second,
      first,
    ]);
    expect(original.nodes).toEqual([first, second]);
  });
  it("corrects same-sequence indexes and rejects moving into one's descendants", () => {
    const inner = block("if", "b"),
      outer = { ...block("if", "a"), children: [inner] };
    const one = block("statement", "a=1"),
      two = block("statement", "a=2");
    const original = doc(one, outer, two);
    expect(
      moveTo(original, one.id, { index: 3 }).nodes.map((n) => n.id),
    ).toEqual([outer.id, two.id, one.id]);
    expect(moveTo(original, outer.id, { index: 2 })).toBe(original);
    expect(
      canMoveTo(original, outer.id, {
        parent: inner.id,
        branch: "children",
        index: 0,
      }),
    ).toBe(false);
    expect(
      moveTo(original, outer.id, {
        parent: inner.id,
        branch: "otherwise",
        index: 0,
      }),
    ).toBe(original);
  });
});
describe("German control words and branch exit", () => {
  it("removes only empty No fields when Enter leaves the complete if", () => {
    const content = block("statement", "x=1"),
      empty = block("statement");
    const condition = { ...block("if", "x"), otherwise: [content, empty] };
    const result = enterLine(doc(condition), empty.id);
    expect(result.document.nodes[0].otherwise).toEqual([content]);
    expect(locate(result.document, result.focus)?.parent).toBeUndefined();
    expect(result.document.nodes).toHaveLength(2);
  });
  it("recognizes falls conditions, explicit equality selections and post-tested loops", () => {
    expect(recognizeTyping(block("statement"), "falls ").kind).toBe("if");
    expect(recognize(block("statement", "FALLS wert GLEICH"))).toMatchObject({
      kind: "switch",
      text: "wert",
    });
    expect(recognize(block("if", "wert gleich"))).toMatchObject({
      kind: "switch",
      text: "wert",
    });
    expect(
      recognize(block("statement", "wiederhole solange x > 0")),
    ).toMatchObject({ kind: "dowhile", text: "x > 0" });
    expect(recognizeTyping(block("repeat"), "solange x > 0")).toMatchObject({
      kind: "dowhile",
      text: "x > 0",
    });
    expect(recognize(block("statement", "wiederhole bis x = 0"))).toMatchObject(
      { kind: "repeat", text: "x = 0" },
    );
  });
  it("does not turn a falls equality condition into a switch halfway through typing", () => {
    let node = recognizeTyping(block("statement"), "falls ");
    for (const text of ["x", "x gleich", "x gleich 10"])
      node = recognizeTyping(node, text);
    expect(node.kind).toBe("if");
    const result = enterLine(doc(node), node.id);
    expect(toPython(result.document)).toBe("if x == 10:\n    pass\n");
  });
  it("navigates using sonst and ende without retaining command statements", () => {
    const otherwise = block("statement", "sonst"),
      ifNode = { ...block("if", "x"), children: [otherwise] };
    const result = enterLine(doc(ifNode), otherwise.id);
    expect(result.document.nodes[0].children).toEqual([]);
    expect(locate(result.document, result.focus)?.branch).toBe("otherwise");
  });
  it("emits native match and a guarded continue for post-tested loops", () => {
    const choice = block("switch", "x");
    expect(validDiagram(doc(choice))).toBe(true);
    expect(toPython(doc(choice))).toBe("match x:\n    case 1:\n        pass\n");
    const loop = {
      ...block("dowhile", "x > 0"),
      children: [block("statement", "continue")],
    };
    expect(toPython(doc(loop))).toBe(
      "while True:\n    if not (x > 0):\n        break\n    continue\n    if not (x > 0):\n        break\n",
    );
  });
});
