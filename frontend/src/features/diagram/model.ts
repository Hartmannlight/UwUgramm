import { pythonText } from "./language";
export type Kind =
  | "statement"
  | "if"
  | "while"
  | "for"
  | "function"
  | "comment"
  | "switch"
  | "case"
  | "dowhile"
  | "repeat";
export interface Block {
  id: string;
  kind: Kind;
  text: string;
  children: Block[];
  otherwise: Block[];
}
export interface Diagram {
  version: 1;
  nodes: Block[];
}
export const kinds: {
  kind: Kind;
  name: string;
  description: string;
  shortcut: string;
  initial: string;
}[] = [
  {
    kind: "statement",
    name: "Anweisung",
    description: "Zuweisung oder Funktionsaufruf",
    shortcut: "1",
    initial: "",
  },
  {
    kind: "if",
    name: "Bedingung",
    description: "Wenn … dann … sonst.",
    shortcut: "2",
    initial: "",
  },
  {
    kind: "for",
    name: "Zählschleife",
    description: "Schritt für Schritt wiederholen.",
    shortcut: "3",
    initial: "",
  },
  {
    kind: "while",
    name: "While-Schleife",
    description: "Solange etwas wahr ist.",
    shortcut: "4",
    initial: "",
  },
  {
    kind: "function",
    name: "Funktion",
    description: "Eine Funktion definieren.",
    shortcut: "5",
    initial: "",
  },
  {
    kind: "comment",
    name: "Kommentar",
    description: "Einen Kommentar einfügen.",
    shortcut: "6",
    initial: "",
  },
  {
    kind: "switch",
    name: "Mehrfachauswahl",
    description: "match / switch mit mehreren Fällen.",
    shortcut: "7",
    initial: "",
  },
  {
    kind: "dowhile",
    name: "Do-While-Schleife",
    description: "Zuerst ausführen, dann solange prüfen.",
    shortcut: "8",
    initial: "",
  },
  {
    kind: "repeat",
    name: "Wiederhole bis",
    description: "Ausführen, bis die Bedingung wahr ist.",
    shortcut: "9",
    initial: "",
  },
  {
    kind: "case",
    name: "Fall",
    description: "Ein Zweig einer Mehrfachauswahl.",
    shortcut: "",
    initial: "1",
  },
];
export function block(kind: Kind, text?: string): Block {
  return {
    id: crypto.randomUUID(),
    kind,
    text: text ?? kinds.find((k) => k.kind === kind)!.initial,
    children: kind === "switch" ? [block("case", "1")] : [],
    otherwise: [],
  };
}
export const example = (): Diagram => ({
  version: 1,
  nodes: [
    block("comment", "Gerade oder ungerade? Finden wir es heraus."),
    block("statement", 'zahl = int(input("Deine Zahl: "))'),
    {
      ...block("if", "zahl % 2 == 0"),
      children: [block("statement", 'print("Die Zahl ist gerade ✨")')],
      otherwise: [block("statement", 'print("Die Zahl ist ungerade")')],
    },
    block("statement", 'print("Geschafft!")'),
  ],
});
export function flatten(nodes: Block[]): Block[] {
  return nodes.flatMap((n) =>
    ["dowhile", "repeat"].includes(n.kind)
      ? [...flatten(n.children), n]
      : [n, ...flatten(n.children), ...flatten(n.otherwise)],
  );
}
export function updateBlock(
  doc: Diagram,
  id: string,
  change: (n: Block) => Block,
): Diagram {
  const map = (nodes: Block[]): Block[] =>
    nodes.map((n) =>
      n.id === id
        ? change(n)
        : { ...n, children: map(n.children), otherwise: map(n.otherwise) },
    );
  return { ...doc, nodes: map(doc.nodes) };
}
export function insertBlock(
  doc: Diagram,
  fresh: Block,
  after?: string,
  child?: "children" | "otherwise",
): Diagram {
  if (!after) return { ...doc, nodes: [...doc.nodes, fresh] };
  if (child)
    return updateBlock(doc, after, (n) => ({
      ...n,
      [child]: [...n[child], fresh],
    }));
  const map = (nodes: Block[]): Block[] =>
    nodes.flatMap((n) =>
      n.id === after
        ? [n, fresh]
        : [{ ...n, children: map(n.children), otherwise: map(n.otherwise) }],
    );
  return { ...doc, nodes: map(doc.nodes) };
}
export function removeBlock(doc: Diagram, id: string): Diagram {
  const map = (nodes: Block[]): Block[] =>
    nodes
      .filter((n) => n.id !== id)
      .map((n) => ({
        ...n,
        children: map(n.children),
        otherwise: map(n.otherwise),
      }));
  return { ...doc, nodes: map(doc.nodes) };
}
export function moveBlock(
  doc: Diagram,
  id: string,
  direction: -1 | 1,
): Diagram {
  const map = (nodes: Block[]): Block[] => {
    const index = nodes.findIndex((n) => n.id === id);
    if (index >= 0) {
      const result = [...nodes];
      const next = index + direction;
      if (next >= 0 && next < nodes.length)
        [result[index], result[next]] = [result[next], result[index]];
      return result;
    }
    return nodes.map((n) => ({
      ...n,
      children: map(n.children),
      otherwise: map(n.otherwise),
    }));
  };
  return { ...doc, nodes: map(doc.nodes) };
}
export function toPython(doc: Diagram): string {
  const sequence = (
    nodes: Block[],
    level: number,
    continueTest?: string,
  ): string[] => {
    const prefix = "    ".repeat(level);
    const lines = nodes.flatMap((n) => {
      if (n.kind === "comment")
        return n.text.split("\n").map((t) => `${prefix}# ${t}`);
      if (n.kind === "statement")
        return n.text.trim()
          ? continueTest && pythonText(n.text, n.kind) === "continue"
            ? [
                `${prefix}if ${continueTest}:`,
                `${prefix}    break`,
                `${prefix}continue`,
              ]
            : [`${prefix}${pythonText(n.text, n.kind)}`]
          : [];
      if (n.kind === "switch") {
        return [
          `${prefix}match ${pythonText(n.text, n.kind) || "wert"}:`,
          ...n.children.flatMap((c) => [
            `${prefix}    case ${pythonText(c.text, "case") || "1"}:`,
            ...sequence(c.children, level + 2, continueTest),
          ]),
          ...(n.otherwise.some((c) => c.kind !== "statement" || c.text.trim())
            ? [
                `${prefix}    case _:`,
                ...sequence(n.otherwise, level + 2, continueTest),
              ]
            : []),
          ...(!n.children.length &&
          !n.otherwise.some((c) => c.kind !== "statement" || c.text.trim())
            ? [`${prefix}    case _:`, `${prefix}        pass`]
            : []),
        ];
      }
      if (n.kind === "dowhile" || n.kind === "repeat") {
        const condition =
          pythonText(n.text, n.kind) ||
          (n.kind === "repeat" ? "False" : "True");
        const stop = n.kind === "dowhile" ? `not (${condition})` : condition;
        return [
          `${prefix}while True:`,
          ...sequence(n.children, level + 1, stop),
          `${prefix}    if ${stop}:`,
          `${prefix}        break`,
        ];
      }
      if (n.kind === "case") return [];
      const defaults = {
        if: "True",
        while: "True",
        for: "i in range(10)",
        function: "funktion()",
      };
      const start = `${prefix}${n.kind === "function" ? "def" : n.kind} ${pythonText(n.text, n.kind) || defaults[n.kind]}:`;
      return [
        start,
        ...sequence(
          n.children,
          level + 1,
          n.kind === "if" ? continueTest : undefined,
        ),
        ...(n.kind === "if" &&
        n.otherwise.some(
          (child) => child.kind !== "statement" || child.text.trim(),
        )
          ? [
              `${prefix}else:`,
              ...sequence(n.otherwise, level + 1, continueTest),
            ]
          : []),
      ];
    });
    if (
      level > 0 &&
      !nodes.some(
        (n) =>
          n.kind !== "comment" && (n.kind !== "statement" || n.text.trim()),
      )
    )
      lines.push(prefix + "pass");
    return lines;
  };
  const lines = sequence(doc.nodes, 0);
  return lines.length ? lines.join("\n") + "\n" : "";
}
export function validDiagram(value: unknown): value is Diagram {
  if (!value || typeof value !== "object") return false;
  const doc = value as Diagram;
  let count = 0;
  const ids = new Set<string>();
  const valid = (nodes: Block[], depth: number, parent?: Kind): boolean =>
    Array.isArray(nodes) &&
    depth <= 20 &&
    nodes.every((n) => {
      if (
        !n ||
        typeof n.id !== "string" ||
        !/^[\w-]{1,80}$/.test(n.id) ||
        ids.has(n.id) ||
        ++count > 500
      )
        return false;
      ids.add(n.id);
      return (
        kinds.some((k) => k.kind === n.kind) &&
        typeof n.text === "string" &&
        n.text.length <= 2000 &&
        (n.kind !== "case" || parent === "switch") &&
        (parent !== "switch" || n.kind === "case") &&
        valid(n.children, depth + 1, n.kind) &&
        valid(n.otherwise, depth + 1) &&
        (["if", "switch"].includes(n.kind) || n.otherwise.length === 0) &&
        (!["statement", "comment"].includes(n.kind) || n.children.length === 0)
      );
    });
  return (
    doc.version === 1 &&
    valid(doc.nodes, 0) &&
    new TextEncoder().encode(JSON.stringify(doc)).length <= 200_000
  );
}
