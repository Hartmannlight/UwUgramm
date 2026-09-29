import { pythonLanguage } from "@codemirror/lang-python";
/** Small lossless lexer for type shorthand. It never evaluates user text. */
export interface Token {
  text: string;
  start: number;
  end: number;
  kind: "name" | "string" | "comment" | "space" | "other";
}
export function tokens(source: string): Token[] {
  const result: Token[] = [];
  const pattern =
    /(?:[rubf]{0,2})?(?:"""[\s\S]*?(?:"""|$)|'''[\s\S]*?(?:'''|$)|"(?:\\.|[^"\\])*(?:"|$)|'(?:\\.|[^'\\])*(?:'|$))|#[^\n]*|[\p{L}_][\p{L}\p{N}_]*|\s+|->|:=|==|!=|<=|>=|./giu;
  for (const match of source.matchAll(pattern)) {
    const text = match[0];
    const kind = /^\s+$/.test(text)
      ? "space"
      : text.startsWith("#")
        ? "comment"
        : /^(?:[rubf]{0,2})?["']/i.test(text)
          ? "string"
          : /^[\p{L}_]/u.test(text)
            ? "name"
            : "other";
    result.push({
      text,
      start: match.index!,
      end: match.index! + text.length,
      kind,
    });
  }
  return result;
}
export const typeAliases: Record<string, string> = {
  gz: "int",
  ganzzahl: "int",
  integer: "int",
  int: "int",
  rz: "float",
  fz: "float",
  fkz: "float",
  double: "float",
  gleitkommazahl: "float",
  fliesskommazahl: "float",
  fließkomma: "float",
  fliesskomma: "float",
  gleitkomma: "float",
  ganzzahlig: "int",
  long: "int",
  short: "int",
  real: "float",
  float: "float",
  kommazahl: "float",
  fließkommazahl: "float",
  zk: "str",
  text: "str",
  string: "str",
  zeichenkette: "str",
  zeichen: "str",
  char: "str",
  str: "str",
  ww: "bool",
  boolean: "bool",
  booleansch: "bool",
  boolesch: "bool",
  boolscher: "bool",
  wahrheitswert: "bool",
  bool: "bool",
  liste: "list",
  list: "list",
  menge: "set",
  set: "set",
  tupel: "tuple",
  tuple: "tuple",
  wörterbuch: "dict",
  woerterbuch: "dict",
  dictionary: "dict",
  dict: "dict",
  void: "None",
  nichts: "None",
  none: "None",
};
export function normalizeType(source: string): string {
  const list = tokens(source);
  const frames: { name: string; part: number }[] = [];
  let previous = "";
  return list
    .map((token) => {
      const literal = frames.some(
        (f) => f.name === "Literal" || (f.name === "Annotated" && f.part > 0),
      );
      let value = token.text;
      if (
        token.text === "<" &&
        ["list", "set", "tuple", "dict"].includes(
          typeAliases[previous.toLowerCase()] || previous,
        )
      ) {
        frames.push({ name: "generic", part: 0 });
        value = "[";
      } else if (token.text === ">" && frames.at(-1)?.name === "generic") {
        frames.pop();
        value = "]";
      }
      if (
        token.kind === "name" &&
        previous !== "." &&
        source.slice(token.end).trimStart()[0] !== "." &&
        !literal
      )
        value = typeAliases[value.toLowerCase()] || value;
      if (token.text === "[") frames.push({ name: previous, part: 0 });
      if (token.text === "]") frames.pop();
      if (token.text === "," && frames.length) frames.at(-1)!.part++;
      if (token.kind !== "space") previous = token.text;
      return value;
    })
    .join("");
}
export interface Signature {
  name: string;
  parameters: string;
  returns: string;
}
export function splitSignature(text: string): Signature {
  const source = text.replace(/^\s*def\s+/, "").replace(/:\s*$/, "");
  const list = tokens(source);
  const opening = list.findIndex((t) => t.text === "(");
  if (opening < 0) return { name: source, parameters: "", returns: "" };
  let depth = 0;
  let closing: Token | undefined;
  for (const token of list.slice(opening)) {
    if (token.text === "(") depth++;
    if (token.text === ")" && !--depth) {
      closing = token;
      break;
    }
  }
  const first = list[opening];
  return {
    name: source.slice(0, first.start).trim(),
    parameters: source.slice(first.end, closing?.start),
    returns: closing
      ? source.slice(closing.end).replace(/^\s*(?:->|:)\s*/, "")
      : "",
  };
}
export const joinSignature = (parts: Signature) =>
  `${parts.name}(${parts.parameters})${parts.returns.trim() ? " -> " + parts.returns : ""}`;

/** German classroom words are translated outside strings and qualified names only. */
export function expression(source: string, condition = false): string {
  let previous = "";
  const words: Record<string, string> = {
    und: "and",
    oder: "or",
    nicht: "not",
    wahr: "True",
    falsch: "False",
  };
  if (condition) words.gleich = "==";
  const list = tokens(source);
  return list
    .map((token, i) => {
      const word = token.text.toLowerCase();
      const qualified =
        previous === "." || source.slice(token.end).trimStart().startsWith(".");
      let value =
        token.kind === "name" && !qualified
          ? words[word] || token.text
          : token.text;
      if (
        condition &&
        token.kind === "name" &&
        ["dann", "wiederhole", "do", "then"].includes(word) &&
        !list.slice(i + 1).some((t) => t.kind !== "space")
      )
        value = "";
      if (token.kind !== "space") previous = token.text;
      return value;
    })
    .join("")
    .trim();
}
export function countingLoop(source: string): string {
  const list = tokens(source);
  const bis = list.find(
    (t) => t.kind === "name" && t.text.toLowerCase() === "bis",
  );
  const step = list.find(
    (t) => t.kind === "name" && t.text.toLowerCase() === "schritt",
  );
  if (bis) {
    const first = source
      .slice(0, bis.start)
      .match(/^\s*([\p{L}_][\p{L}\p{N}_]*)\s*(?:←|<-|:=|=|von)\s*(.+)$/iu);
    if (first) {
      const end = source.slice(bis.end, step?.start).trim();
      const increment = step ? source.slice(step.end).trim() : "1";
      return `${first[1]} in range(${expression(first[2])}, (${expression(end)}) + (1 if (${expression(increment)}) > 0 else -1), ${expression(increment)})`;
    }
  }
  return expression(source.replace(/^jedes?\s+/i, "")).replace(
    /\s+IN\s+/g,
    " in ",
  );
}

export function comparison(source: string): string {
  const groups: boolean[] = [];
  let previous: Token | undefined;
  const nonCalls = new Set([
    "and",
    "or",
    "not",
    "if",
    "else",
    "in",
    "is",
    "while",
  ]);
  return tokens(source)
    .map((token) => {
      let value = token.text;
      if (value === "(")
        groups.push(
          !!previous &&
            ((previous.kind === "name" && !nonCalls.has(previous.text)) ||
              [")", "]"].includes(previous.text)),
        );
      else if (["[", "{"].includes(value)) groups.push(false);
      else if ([")", "]", "}"].includes(value)) groups.pop();
      else if (value === "=" && !groups.at(-1)) value = "==";
      else if (token.kind === "other")
        value =
          ({ "≤": "<=", "≥": ">=", "≠": "!=" } as Record<string, string>)[
            value
          ] || value;
      if (token.kind !== "space") previous = token;
      return value;
    })
    .join("");
}

/** Return annotation spans only: strings, dictionaries, slices and defaults stay untouched. */
export function annotations(
  source: string,
  signature = false,
): { start: number; end: number }[] {
  const list = tokens(source);
  const result: { start: number; end: number }[] = [];
  let depth = 0;
  let start = -1;
  let base = 0;
  let parameterStart = 0;
  const declaration =
    /^\s*[\p{L}_][\p{L}\p{N}_]*(?:\.[\p{L}_][\p{L}\p{N}_]*)*\s*:/u.exec(source);
  for (const token of list) {
    if (
      start >= 0 &&
      ((depth === base && [",", "=", ";", ")"].includes(token.text)) ||
        token.kind === "comment")
    ) {
      result.push({ start, end: token.start });
      start = -1;
    }
    if (
      start < 0 &&
      token.text === ":" &&
      ((signature &&
        depth === 1 &&
        /^\s*\*{0,2}[\p{L}_][\p{L}\p{N}_]*\s*$/u.test(
          source.slice(parameterStart, token.start),
        )) ||
        (!signature &&
          declaration &&
          token.start === declaration[0].length - 1))
    ) {
      start = token.end;
      base = depth;
    }
    if (start < 0 && signature && token.text === "->" && depth === 0) {
      start = token.end;
      base = 0;
    }
    if (
      (token.text === "(" && depth === 0) ||
      (token.text === "," && depth === 1)
    )
      parameterStart = token.end;
    if (
      ["(", "[", "{"].includes(token.text) ||
      (start >= 0 && token.text === "<")
    )
      depth++;
    if (
      [")", "]", "}"].includes(token.text) ||
      (start >= 0 && token.text === ">")
    )
      depth--;
  }
  if (start >= 0) result.push({ start, end: source.length });
  return result;
}
export function pythonText(text: string, kind: string): string {
  let source = text.trim();
  if (!source) return "";
  if (kind === "dowhile") source = source.replace(/^(?:while|solange)\s+/i, "");
  if (kind === "repeat") source = source.replace(/^(?:until|bis)\s+/i, "");
  if (["if", "while", "dowhile", "repeat"].includes(kind))
    return comparison(expression(source, true));
  if (kind === "for") return countingLoop(source);
  if (kind === "switch") return expression(source);
  if (kind === "case") {
    let depth = 0;
    return tokens(expression(source))
      .map((token) => {
        if (["(", "[", "{"].includes(token.text)) depth++;
        if ([")", "]", "}"].includes(token.text)) depth--;
        return token.text === "," && depth === 0 ? " |" : token.text;
      })
      .join("");
  }
  if (kind === "function") source = joinSignature(splitSignature(source));
  if (kind === "statement") {
    source = source
      .replace(/^(?:rückgabe|rueckgabe|return)\b\s*/i, "return ")
      .replace(/^(?:abbruch)\s*$/i, "break")
      .replace(/^(?:weiter)\s*$/i, "continue");
    const output = source.match(/^(?:ausgabe|gib\s+aus)\s+(.+)$/i);
    if (output) source = `print(${output[1]})`;
    source = source.replace(
      /^([\p{L}_][\p{L}\p{N}_]*(?:\s*:\s*[^=←]+)?)\s*(?:←|:=)\s*/u,
      (_match, target: string) => target.trimEnd() + " = ",
    );
    source = expression(source);
  }
  const ranges = annotations(source, kind === "function");
  for (const range of ranges.reverse())
    source =
      source.slice(0, range.start) +
      normalizeType(source.slice(range.start, range.end)) +
      source.slice(range.end);
  return source;
}
const keywords = new Set(
  "if else elif for while in is not and or def return break continue pass True False None import from as assert del global nonlocal raise lambda yield await async class try except finally with match case print input len range int float str bool list dict set tuple".split(
    " ",
  ),
);
export function identifiers(source: string, signature = false): Token[] {
  const prefix = signature ? "def " : "";
  const cursor = pythonLanguage.parser
    .parse(prefix + source + (signature ? ":\n    pass" : ""))
    .cursor();
  const result: Token[] = [];
  do {
    if (cursor.name !== "VariableName") continue;
    let parent = cursor.node.parent;
    let type = false;
    while (parent) {
      if (parent.name === "TypeDef") {
        type = true;
        break;
      }
      parent = parent.parent;
    }
    const start = cursor.from - prefix.length,
      end = cursor.to - prefix.length;
    const text = source.slice(start, end);
    if (!type && start >= 0 && end <= source.length && !keywords.has(text))
      result.push({ text, start, end, kind: "name" });
  } while (cursor.next());
  return result;
}
export function identifierAt(
  source: string,
  position: number,
  signature = false,
): string {
  return (
    identifiers(source, signature).find(
      (t) => t.start <= position && t.end > position,
    )?.text ||
    identifiers(source, signature).find((t) => t.end === position)?.text ||
    ""
  );
}
