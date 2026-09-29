import { block, flatten, insertBlock, removeBlock, updateBlock } from "./model";
import type { Block, Diagram, Kind } from "./model";
import { comparison, joinSignature, splitSignature } from "./language";
export { comparison } from "./language";

export type Branch = "children" | "otherwise";
export interface Position {
  parent?: string;
  branch?: Branch;
  index: number;
}
interface Location extends Position {
  node: Block;
  siblings: Block[];
  ancestors: { node: Block; branch: Branch }[];
}
export function locate(doc: Diagram, id: string): Location | undefined {
  const search = (
    nodes: Block[],
    parent?: string,
    branch?: Branch,
    ancestors: Location["ancestors"] = [],
  ): Location | undefined => {
    for (let index = 0; index < nodes.length; index++) {
      const node = nodes[index];
      if (node.id === id)
        return { node, siblings: nodes, index, parent, branch, ancestors };
      for (const child of ["children", "otherwise"] as const) {
        const found = search(node[child], node.id, child, [
          ...ancestors,
          { node, branch: child },
        ]);
        if (found) return found;
      }
    }
  };
  return search(doc.nodes);
}
export function insertAt(
  doc: Diagram,
  fresh: Block,
  position: Position,
): Diagram {
  const insert = (nodes: Block[]) => [
    ...nodes.slice(0, position.index),
    fresh,
    ...nodes.slice(position.index),
  ];
  return position.parent
    ? updateBlock(doc, position.parent, (n) => ({
        ...n,
        [position.branch!]: insert(n[position.branch!]),
      }))
    : { ...doc, nodes: insert(doc.nodes) };
}
export function after(doc: Diagram, id?: string): Position {
  const location = id && locate(doc, id);
  return location
    ? {
        parent: location.parent,
        branch: location.branch,
        index: location.index + 1,
      }
    : { index: doc.nodes.length };
}
export function canMoveTo(doc: Diagram, id: string, target: Position): boolean {
  const source = locate(doc, id);
  if (!source || !Number.isInteger(target.index) || target.index < 0)
    return false;
  const parent = target.parent ? locate(doc, target.parent)?.node : undefined;
  if (target.parent && (!parent || !target.branch)) return false;
  if (parent && flatten([source.node]).some((n) => n.id === parent.id))
    return false;
  if (parent && ["statement", "comment"].includes(parent.kind)) return false;
  if (
    target.branch === "otherwise" &&
    parent &&
    !["if", "switch"].includes(parent.kind)
  )
    return false;
  if (source.node.kind === "case")
    return parent?.kind === "switch" && target.branch === "children";
  return !(parent?.kind === "switch" && target.branch === "children");
}
export function moveTo(doc: Diagram, id: string, target: Position): Diagram {
  if (!canMoveTo(doc, id, target)) return doc;
  const source = locate(doc, id)!;
  const same =
    source.parent === target.parent && source.branch === target.branch;
  const index = target.index - (same && source.index < target.index ? 1 : 0);
  if (same && index === source.index) return doc;
  return insertAt(removeBlock(doc, id), source.node, { ...target, index });
}

export function recognize(node: Block): Block {
  if (
    node.kind === "if" &&
    /^[\p{L}_][\p{L}\p{N}_.]*\s+gleich\s*:?\s*$/iu.test(node.text)
  )
    return {
      ...node,
      kind: "switch",
      text: node.text.replace(/\s+gleich\s*:?\s*$/i, ""),
      children: node.children.length
        ? [{ ...block("case", "1"), children: node.children }]
        : [block("case", "1")],
    };
  if (node.kind !== "statement") return node;
  const match = node.text
    .trim()
    .match(
      /^\/?(if|wenn|falls|while|solange|for|für|fuer|foreach|def|funktion|operation|prozedur|switch|match|auswahl|do-while|dowhile|do|repeat|wiederhole|bis)\b\s*(.*)$/i,
    );
  if (!match) return node;
  const key = match[1].toLowerCase();
  const kind: Kind = ["if", "wenn", "falls"].includes(key)
    ? "if"
    : ["while", "solange"].includes(key)
      ? "while"
      : ["for", "für", "fuer", "foreach"].includes(key)
        ? "for"
        : ["switch", "match", "auswahl"].includes(key)
          ? "switch"
          : ["do-while", "dowhile", "do"].includes(key)
            ? "dowhile"
            : ["repeat", "wiederhole", "bis"].includes(key)
              ? "repeat"
              : "function";
  let text = match[2].replace(/:\s*$/, "").trim();
  if (kind === "if" || kind === "while") text = comparison(text);
  if (kind === "function" && text) text = joinSignature(splitSignature(text));
  if (key === "falls" && /\s+gleich$/i.test(text))
    return {
      ...node,
      kind: "switch",
      text: text.replace(/\s+gleich$/i, ""),
      children: [block("case", "1")],
    };
  if (kind === "dowhile") text = text.replace(/^(?:while|solange)\s+/i, "");
  if (kind === "repeat" && /^(?:while|solange)\s+/i.test(text))
    return {
      ...node,
      kind: "dowhile",
      text: text.replace(/^(?:while|solange)\s+/i, ""),
    };
  if (kind === "repeat") text = text.replace(/^(?:until|bis)\s+/i, "");
  return {
    ...node,
    kind,
    text,
    children:
      kind === "switch" && !node.children.length
        ? [block("case", "1")]
        : node.children,
  };
}
/** Convert as soon as a complete keyword and space are typed; preserve the unfinished expression. */
export function recognizeTyping(node: Block, value: string): Block {
  if (node.kind === "repeat" && /^(?:while|solange)\s+/i.test(value))
    return {
      ...node,
      kind: "dowhile",
      text: value.replace(/^(?:while|solange)\s+/i, ""),
    };
  if (node.kind !== "statement") return { ...node, text: value };
  const match = value.match(
    /^\s*(if|wenn|falls|while|solange|for|für|fuer|foreach|switch|match|auswahl|do-while|dowhile|do|repeat|wiederhole|bis)\s+(.*)$/is,
  );
  if (!match) return { ...node, text: value };
  return recognize({ ...node, text: value });
}
export function enterBranch(
  doc: Diagram,
  parent: string,
  branch: Branch,
): { document: Diagram; focus: string } {
  const container = locate(doc, parent)!.node;
  if (container.kind === "switch" && branch === "children") {
    if (container.children[0])
      return enterBranch(doc, container.children[0].id, "children");
    const fresh = block("case", "1");
    return {
      document: insertBlock(doc, fresh, parent, branch),
      focus: fresh.id,
    };
  }
  if (container[branch][0])
    return { document: doc, focus: container[branch][0].id };
  const fresh = block("statement");
  return { document: insertBlock(doc, fresh, parent, branch), focus: fresh.id };
}
export function enterLine(
  doc: Diagram,
  id: string,
  outside = false,
): { document: Diagram; focus: string } {
  const location = locate(doc, id);
  if (!location) return { document: doc, focus: id };
  if (location.node.kind === "statement") {
    const command = location.node.text.trim();
    const container = [...location.ancestors]
      .reverse()
      .find((a) => ["if", "switch"].includes(a.node.kind));
    if (/^(?:sonst|else)\s*:?(?:\s*)$/i.test(command) && container)
      return enterBranch(removeBlock(doc, id), container.node.id, "otherwise");
    if (
      /^(?:ende(?:\s+(?:wenn|falls|if|solange|für|fuer|wiederhole|funktion))?|end)\s*$/i.test(
        command,
      ) &&
      location.ancestors.length
    )
      return enterLine(
        removeBlock(doc, id),
        location.ancestors.at(-1)!.node.id,
        true,
      );
  }
  if (
    !outside &&
    location.node.kind === "statement" &&
    !location.node.text.trim()
  ) {
    const parent = location.ancestors.at(-1);
    if (!parent) return { document: doc, focus: id };
    const cleaned = updateBlock(doc, parent.node.id, (node) => ({
      ...node,
      [parent.branch]: node[parent.branch].filter(
        (child) => child.kind !== "statement" || child.text.trim(),
      ),
    }));
    if (parent.node.kind === "if" && parent.branch === "children")
      return enterBranch(cleaned, parent.node.id, "otherwise");
    if (parent.node.kind === "case") {
      const caseLocation = locate(cleaned, parent.node.id)!;
      const next = caseLocation.siblings[caseLocation.index + 1];
      return next
        ? enterBranch(cleaned, next.id, "children")
        : enterBranch(cleaned, caseLocation.parent!, "otherwise");
    }
    return enterLine(cleaned, parent.node.id, true);
  }
  let node = recognize(location.node);
  if (!["statement", "comment"].includes(node.kind))
    node = { ...node, text: node.text.replace(/:\s*$/, "") };
  if (["if", "while", "dowhile", "repeat"].includes(node.kind))
    node = {
      ...node,
      text: comparison(
        node.text
          .replace(/:\s*$/, "")
          .replace(new RegExp(`^${node.kind}\\s+`), ""),
      ),
    };
  let document = updateBlock(doc, id, () => node);
  if (!outside && !["statement", "comment"].includes(node.kind))
    return enterBranch(document, id, "children");
  const anchor =
    outside &&
    ["statement", "comment"].includes(node.kind) &&
    location.ancestors.length
      ? location.ancestors.at(-1)!.node.id
      : id;
  let anchorLocation = locate(document, anchor)!;
  if (anchorLocation.node.kind === "case")
    anchorLocation = locate(document, anchorLocation.parent!)!;
  const next = anchorLocation.siblings[anchorLocation.index + 1];
  if (next && next.kind === "statement" && !next.text.trim())
    return { document, focus: next.id };
  const fresh = block("statement");
  document = insertAt(document, fresh, after(document, anchorLocation.node.id));
  return { document, focus: fresh.id };
}
export function switchBranch(
  doc: Diagram,
  id: string,
  backward = false,
): { document: Diagram; focus: string } | undefined {
  const current = locate(doc, id);
  if (!current) return;
  if (current.node.kind === "if")
    return enterBranch(doc, id, backward ? "otherwise" : "children");
  if (current.node.kind === "switch")
    return enterBranch(doc, id, backward ? "otherwise" : "children");
  if (current.node.kind === "case") return enterBranch(doc, id, "children");
  const choice = [...current.ancestors]
    .reverse()
    .find((a) => ["if", "switch"].includes(a.node.kind));
  if (!choice) return;
  if (choice.node.kind === "switch") {
    if (choice.branch === "otherwise")
      return backward && choice.node.children.length
        ? enterBranch(doc, choice.node.children.at(-1)!.id, "children")
        : enterLine(doc, choice.node.id, true);
    const caseAncestor = current.ancestors.find((a) => a.node.kind === "case");
    const index = choice.node.children.findIndex(
      (n) => n.id === caseAncestor?.node.id,
    );
    const next = choice.node.children[index + (backward ? -1 : 1)];
    return next
      ? enterBranch(doc, next.id, "children")
      : backward
        ? { document: doc, focus: choice.node.id }
        : enterBranch(doc, choice.node.id, "otherwise");
  }
  if (choice.branch === "otherwise")
    return backward
      ? enterBranch(doc, choice.node.id, "children")
      : enterLine(doc, choice.node.id, true);
  return backward
    ? { document: doc, focus: choice.node.id }
    : enterBranch(doc, choice.node.id, "otherwise");
}
export function eraseEmpty(
  doc: Diagram,
  id: string,
): { document: Diagram; focus: string } | undefined {
  const current = locate(doc, id);
  const emptyFunction =
    current?.node.kind === "function" &&
    Object.values(splitSignature(current.node.text)).every(
      (value) => !value.trim(),
    );
  if (
    !current ||
    (!emptyFunction && current.node.text.trim()) ||
    current.node.children.length ||
    current.node.otherwise.length
  )
    return;
  const nodes = flatten(doc.nodes);
  const index = nodes.findIndex((n) => n.id === id);
  return {
    document: removeBlock(doc, id),
    focus: nodes[index - 1]?.id || nodes[index + 1]?.id || "diagram",
  };
}
export const assignment = (text: string) =>
  /^\s*[\p{L}_][\p{L}\p{N}_]*(?:\s*:\s*[^=]+)?\s*=(?!=)/u.test(text);
