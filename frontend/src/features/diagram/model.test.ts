import { describe, expect, it } from "vitest";
import {
  block,
  example,
  flatten,
  insertBlock,
  moveBlock,
  removeBlock,
  toPython,
  updateBlock,
  validDiagram,
} from "./model";

describe("structural editing", () => {
  it("inserts and moves inside the correct branch without changing its sibling", () => {
    const doc = example();
    const choice = doc.nodes[2];
    const fresh = block("statement", "x = 3");
    const inserted = insertBlock(doc, fresh, choice.children[0].id);
    expect(inserted.nodes[2].children).toHaveLength(2);
    const moved = moveBlock(inserted, fresh.id, -1);
    expect(moved.nodes[2].children[0].id).toBe(fresh.id);
    expect(moved.nodes[2].otherwise).toEqual(choice.otherwise);
    expect(doc.nodes[2].children).toHaveLength(1);
  });
  it("deletes an entire subtree and keeps other blocks", () => {
    const doc = example();
    const updated = removeBlock(doc, doc.nodes[2].id);
    expect(flatten(updated.nodes)).toHaveLength(3);
    expect(validDiagram(updated)).toBe(true);
  });
  it("updates deeply nested text without mutating input", () => {
    const doc = example();
    const id = doc.nodes[2].otherwise[0].id;
    const updated = updateBlock(doc, id, (n) => ({ ...n, text: "print(5)" }));
    expect(toPython(updated)).toContain("else:\n    print(5)");
    expect(toPython(doc)).toContain("ungerade");
  });
  it("rejects corrupted imports and hidden children", () => {
    expect(validDiagram({ version: 1, nodes: [null] })).toBe(false);
    const doc = example();
    doc.nodes[1].children.push(block("statement"));
    expect(validDiagram(doc)).toBe(false);
  });
  it("emits pass for comment-only bodies", () => {
    expect(
      toPython({
        version: 1,
        nodes: [
          { ...block("while", "True"), children: [block("comment", "TODO")] },
        ],
      }),
    ).toBe("while True:\n    # TODO\n    pass\n");
  });
});
