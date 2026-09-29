import { Fragment, useMemo, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent } from "react";
import { Plus, CornerUpLeft, Trash2, GripVertical } from "lucide-react";
import { kinds } from "./model";
import type { Block, Kind } from "./model";
import { assignment } from "./editing";
import type { Branch, Position } from "./editing";
import { joinSignature, pythonText, splitSignature } from "./language";
import { layoutDiagram } from "./layout";
import type { DiagramLayout } from "./layout";
import InlineEditor, { atVisualEdge } from "./InlineEditor";
export interface DiagramActions {
  selected: string;
  select: (id: string) => void;
  text: (id: string, value: string) => void;
  insert: (kind: Kind, position?: Position) => void;
  enter: (id: string, outside: boolean) => void;
  tab: (id: string, backward: boolean) => boolean;
  erase: (id: string) => void;
  navigate: (id: string, direction: -1 | 1) => void;
  move: (id: string, direction: -1 | 1) => void;
  empty: (position: Position) => void;
  activeName: string;
  hoverName: (name: string) => void;
  cursorName: (name: string) => void;
  remove: (id: string) => void;
  branch: (id: string, branch: Branch) => void;
  drag: {
    id: string;
    target?: Position;
    start: (id: string) => void;
    end: () => void;
    over: (position?: Position) => void;
    drop: (position: Position, id?: string) => void;
    canDrop: (position: Position, id?: string) => boolean;
  };
}
function targetAt(sequence: Element, y: number): Position {
  const blocks = Array.from(sequence.children).filter((e) =>
    e.hasAttribute("data-block-id"),
  );
  const before = blocks.findIndex((e) => {
    const rect = e.getBoundingClientRect();
    return y < rect.top + rect.height / 2;
  });
  return {
    parent: sequence.getAttribute("data-parent") || undefined,
    branch: (sequence.getAttribute("data-branch") || undefined) as
      Branch | undefined,
    index:
      Number(sequence.getAttribute("data-offset") || 0) +
      (before < 0 ? blocks.length : before),
  };
}
function BlockGrip({
  node,
  actions,
}: {
  node: Block;
  actions: DiagramActions;
}) {
  const pointer = useRef<{ x: number; y: number; moving: boolean } | undefined>(
    undefined,
  );
  const destination = (x: number, y: number) => {
    const sequence = document.elementFromPoint(x, y)?.closest(".sequence");
    if (!sequence) return;
    const target = targetAt(sequence, y);
    return actions.drag.canDrop(target, node.id) ? target : undefined;
  };
  return (
    <button
      className="block-grip"
      aria-label={`${kinds.find((k) => k.kind === node.kind)!.name} verschieben: ${node.text || "Leerer Block"}`}
      title="Ziehen zum Verschieben · Alt+↑/↓ per Tastatur"
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        pointer.current = { x: event.clientX, y: event.clientY, moving: false };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        const gesture = pointer.current;
        if (!gesture) return;
        if (
          !gesture.moving &&
          Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) < 5
        )
          return;
        if (!gesture.moving) {
          gesture.moving = true;
          actions.drag.start(node.id);
        }
        actions.drag.over(destination(event.clientX, event.clientY));
        const canvas = event.currentTarget.closest(".canvas-scroll");
        if (canvas) {
          const rect = canvas.getBoundingClientRect();
          if (event.clientY < rect.top + 40) canvas.scrollBy(0, -16);
          else if (event.clientY > rect.bottom - 40) canvas.scrollBy(0, 16);
        }
      }}
      onPointerUp={(event) => {
        if (pointer.current?.moving) {
          const target = destination(event.clientX, event.clientY);
          if (target) actions.drag.drop(target, node.id);
          else actions.drag.end();
        }
        pointer.current = undefined;
      }}
      onPointerCancel={() => {
        pointer.current = undefined;
        actions.drag.end();
      }}
      onKeyDown={(event) => {
        if (event.altKey && ["ArrowUp", "ArrowDown"].includes(event.key)) {
          event.preventDefault();
          actions.move(node.id, event.key === "ArrowUp" ? -1 : 1);
        }
      }}
    >
      <GripVertical size={12} />
    </button>
  );
}
const snippets = [
  { name: "if", value: "if ", start: 3, end: 3, display: "if Bedingung" },
  {
    name: "while",
    value: "while ",
    start: 6,
    end: 6,
    display: "while Bedingung",
  },
  {
    name: "for",
    value: "for i in range(10)",
    start: 4,
    end: 5,
    display: "for i in range(…) ",
  },
  {
    name: "def",
    value: "def funktion(parameter) -> GZ",
    start: 4,
    end: 12,
    display: "def funktion(…) → Typ",
  },
  {
    name: "print",
    value: 'print("Text")',
    start: 7,
    end: 11,
    display: "print(…) ",
  },
  {
    name: "input",
    value: 'input("Frage: ")',
    start: 7,
    end: 14,
    display: "input(…) ",
  },
  { name: "range", value: "range(10)", start: 6, end: 8, display: "range(…) " },
  { name: "len", value: "len(liste)", start: 4, end: 9, display: "len(…) " },
  { name: "int", value: "int(wert)", start: 4, end: 8, display: "int(…) " },
  ...[
    "wenn",
    "falls",
    "solange",
    "für",
    "fuer",
    "switch",
    "match",
    "wiederhole",
    "dowhile",
  ].map((name) => ({
    name,
    value: name + " ",
    start: name.length + 1,
    end: name.length + 1,
    display: name + " …",
  })),
];
const aliases: Record<Kind, string> = {
  statement: "anweisung statement x =",
  if: "if wenn falls bedingung",
  while: "while solange schleife",
  for: "for für fuer foreach zählschleife",
  function: "def function funktion operation prozedur",
  comment: "comment kommentar #",
  switch: "switch match auswahl mehrfachauswahl",
  case: "case fall",
  dowhile: "do dowhile do-while wiederhole solange",
  repeat: "repeat wiederhole bis until",
};
function BlockLine({
  node,
  actions,
  prefix,
}: {
  node: Block;
  actions: DiagramActions;
  prefix?: string;
}) {
  const [suggest, setSuggest] = useState(false);
  const [choice, setChoice] = useState(0);
  const [focused, setFocused] = useState(false);
  const slash =
    node.kind === "statement" && node.text.trimStart().startsWith("/");
  const query = slash ? node.text.trimStart().slice(1).toLowerCase() : "";
  const options = slash
    ? kinds.filter((k) => k.kind !== "case" && aliases[k.kind].includes(query))
    : [];
  const word = node.text.match(/[\p{L}-]+$/u)?.[0]?.toLowerCase() || "";
  const completions =
    suggest && word && !slash
      ? snippets.filter(
          (s) =>
            s.name.startsWith(word) &&
            (![
              "if",
              "for",
              "while",
              "def",
              "wenn",
              "falls",
              "solange",
              "für",
              "fuer",
              "switch",
              "match",
              "wiederhole",
              "dowhile",
            ].includes(s.name) ||
              node.kind === "statement"),
        )
      : [];
  const count = focused ? (slash ? options.length : completions.length) : 0;
  const accept = (index: number) => {
    let value: string;
    let start: number;
    let end: number;
    if (slash) {
      const selected = options[index];
      if (!selected) return;
      value =
        selected.kind === "comment"
          ? "#"
          : selected.kind === "statement"
            ? ""
            : selected.kind === "function"
              ? "def "
              : selected.kind + " ";
      start = end = value.length;
    } else {
      const item = completions[index];
      if (!item) return;
      const before = node.text.slice(0, -word.length);
      value = before + item.value;
      start = before.length + item.start;
      end = before.length + item.end;
    }
    actions.text(node.id, value);
    setSuggest(false);
    requestAnimationFrame(() => {
      const input = document.getElementById(
        "block-" + node.id,
      ) as HTMLTextAreaElement | null;
      if (input) {
        input.focus();
        const removed = value.length - input.value.length;
        input.setSelectionRange(
          Math.max(0, start - removed),
          Math.max(0, end - removed),
        );
      }
    });
  };
  const onKey = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (count && ["ArrowDown", "ArrowUp", "Enter", "Tab"].includes(event.key)) {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === "Enter" || event.key === "Tab") accept(choice % count);
      else
        setChoice(
          (i) => (i + (event.key === "ArrowDown" ? 1 : count - 1)) % count,
        );
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      actions.enter(node.id, event.altKey || event.ctrlKey || event.metaKey);
    }
    if (event.key === "Backspace" && !node.text.trim()) {
      event.preventDefault();
      actions.erase(node.id);
    }
    if (event.key === "Tab" && actions.tab(node.id, event.shiftKey))
      event.preventDefault();
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      const field = event.currentTarget;
      const direction = event.key === "ArrowUp" ? -1 : 1;
      // Wrapped lines retain native caret navigation; crossing at either edge changes blocks.
      if (event.altKey || atVisualEdge(field, direction)) {
        event.preventDefault();
        (event.altKey ? actions.move : actions.navigate)(node.id, direction);
      }
    }
    if (event.key === "Escape") {
      event.preventDefault();
      if (suggest || slash) {
        setSuggest(false);
        if (slash) actions.text(node.id, "");
      } else {
        event.currentTarget.blur();
        document.getElementById("diagram")?.focus();
      }
    }
  };
  const label =
    node.kind === "statement" && assignment(node.text)
      ? "Zuweisung"
      : kinds.find((k) => k.kind === node.kind)!.name;
  const normalized = pythonText(node.text, node.kind);
  return (
    <div
      className={`block-line ${node.kind === "comment" ? "comment-line" : ""}`}
    >
      {prefix && <span className="syntax-prefix">{prefix}</span>}
      {node.kind === "statement" && /^return\b/.test(node.text) && (
        <CornerUpLeft
          size={16}
          className="return-symbol"
          aria-label="Rückgabe"
        />
      )}
      <InlineEditor
        id={"block-" + node.id}
        label={`${label}: ${node.text || "Leerer Block"}`}
        value={node.text}
        placeholder={
          ["if", "while", "dowhile", "repeat"].includes(node.kind)
            ? "Bedingung"
            : node.kind === "for"
              ? "i in range(10)"
              : node.kind === "comment"
                ? "Kommentar"
                : node.kind === "switch"
                  ? "Ausdruck / Variable"
                  : node.kind === "case"
                    ? "1 | 2 oder 'Text'"
                    : "Anweisung oder /"
        }
        activeName={actions.activeName}
        hoverName={actions.hoverName}
        cursorName={actions.cursorName}
        onFocus={() => {
          actions.select(node.id);
          setFocused(true);
        }}
        onBlur={() => {
          setSuggest(false);
          setFocused(false);
        }}
        onChange={(value) => {
          actions.text(node.id, value);
          setSuggest(true);
          setChoice(0);
        }}
        onKeyDown={onKey}
        expanded={count > 0}
        controls={count ? "completion-" + node.id : undefined}
        activeOption={count ? `option-${node.id}-${choice % count}` : undefined}
      />
      {focused &&
        normalized !== node.text.trim() &&
        node.kind === "statement" && (
          <span className="type-hint">Python: {normalized}</span>
        )}
      {count > 0 && (
        <div
          className="completions"
          id={"completion-" + node.id}
          role="listbox"
        >
          {(slash
            ? options.map((k) => ({
                name: k.kind,
                label: k.name,
                code: k.kind === "function" ? "def" : k.kind,
              }))
            : completions.map((s) => ({
                name: s.name,
                label: "Tab",
                code: s.display,
              }))
          ).map((option, index) => (
            <div
              id={`option-${node.id}-${index}`}
              role="option"
              aria-selected={choice % count === index}
              key={option.name}
              className={choice % count === index ? "chosen" : ""}
              onMouseDown={(event) => {
                event.preventDefault();
                accept(index);
              }}
            >
              <code>{option.code}</code>
              <span>{option.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
function FunctionHeader({
  node,
  actions,
}: {
  node: Block;
  actions: DiagramActions;
}) {
  const parts = splitSignature(node.text);
  const fields = ["name", "parameters", "returns"] as const;
  const ids = {
    name: "block-" + node.id,
    parameters: "block-" + node.id + "-parameters",
    returns: "block-" + node.id + "-returns",
  };
  const labels = {
    name: "Funktion",
    parameters: "Parameter",
    returns: "Rückgabetyp",
  };
  const placeholders = {
    name: "funktion",
    parameters: "keine Parameter",
    returns: "ohne Typangabe",
  };
  const go = (field: keyof typeof ids) =>
    requestAnimationFrame(() => document.getElementById(ids[field])?.focus());
  return (
    <div className="function-header">
      {fields.map((field) => (
        <div className={"function-field function-" + field} key={field}>
          <label htmlFor={ids[field]}>{labels[field]}</label>
          <InlineEditor
            id={ids[field]}
            value={parts[field]}
            label={`${labels[field]}: ${parts[field] || placeholders[field]}`}
            placeholder={placeholders[field]}
            parameters={field === "parameters"}
            activeName={field === "returns" ? "" : actions.activeName}
            hoverName={field === "returns" ? () => {} : actions.hoverName}
            cursorName={
              field === "returns"
                ? () => actions.cursorName("")
                : actions.cursorName
            }
            onFocus={() => actions.select(node.id)}
            onChange={(value) =>
              actions.text(node.id, joinSignature({ ...parts, [field]: value }))
            }
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing) return;
              if (event.key === "Enter") {
                event.preventDefault();
                if (event.altKey) actions.enter(node.id, true);
                else if (field === "name") go("parameters");
                else if (field === "parameters") go("returns");
                else actions.enter(node.id, false);
              }
              if (event.key === "Tab") {
                event.preventDefault();
                if (field === "name") {
                  if (event.shiftKey)
                    document.getElementById("diagram")?.focus();
                  else go("parameters");
                } else if (field === "parameters")
                  go(event.shiftKey ? "name" : "returns");
                else if (event.shiftKey) go("parameters");
                else actions.enter(node.id, false);
              }
              if (event.key === "Escape") {
                event.preventDefault();
                document.getElementById("diagram")?.focus();
              }
              if (
                event.key === "Backspace" &&
                field === "name" &&
                !parts.name &&
                !parts.parameters &&
                !parts.returns
              ) {
                event.preventDefault();
                actions.erase(node.id);
              }
            }}
          />
        </div>
      ))}
    </div>
  );
}
function InsertLine({
  position,
  actions,
  kind = "statement",
}: {
  position: Position;
  actions: DiagramActions;
  kind?: Kind;
}) {
  return (
    <div className="insertion-line">
      <button
        tabIndex={-1}
        aria-label="Block an dieser Linie einfügen"
        data-drop-target={
          (!!actions.drag.id &&
            actions.drag.target?.parent === position.parent &&
            actions.drag.target?.branch === position.branch &&
            actions.drag.target?.index === position.index) ||
          undefined
        }
        onClick={() => actions.insert(kind, position)}
      >
        <Plus size={14} />
      </button>
    </div>
  );
}
export default function DiagramView({
  nodes,
  actions,
  parent,
  branch,
  layout: given,
  offset = 0,
}: {
  nodes: Block[];
  actions: DiagramActions;
  parent?: string;
  branch?: Branch;
  layout?: DiagramLayout;
  offset?: number;
}) {
  const layout = useMemo(() => given || layoutDiagram(nodes), [given, nodes]);
  const position = (index: number): Position => ({
    parent,
    branch,
    index: index + offset,
  });
  return (
    <div
      className="sequence"
      data-parent={parent}
      data-branch={branch}
      data-offset={offset}
      style={!parent ? { width: layout.width } : undefined}
      onDragOver={(event) => {
        if (!actions.drag.id) return;
        event.stopPropagation();
        const target = targetAt(event.currentTarget, event.clientY);
        if (actions.drag.canDrop(target)) {
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
          actions.drag.over(target);
        } else {
          event.dataTransfer.dropEffect = "none";
          actions.drag.over(undefined);
        }
      }}
      onDrop={(event) => {
        if (!actions.drag.id) return;
        event.preventDefault();
        event.stopPropagation();
        const target = targetAt(event.currentTarget, event.clientY);
        if (
          target &&
          target.parent === parent &&
          target.branch === branch &&
          actions.drag.canDrop(target)
        )
          actions.drag.drop(target);
      }}
    >
      <InsertLine
        position={position(0)}
        actions={actions}
        kind={nodes[0]?.kind === "case" ? "case" : "statement"}
      />
      {!nodes.length && (
        <input
          className="empty-sequence"
          aria-label={
            parent
              ? `${branch === "otherwise" ? "Nein" : "Innerer"}-Zweig: erste Anweisung`
              : "Erste Anweisung"
          }
          placeholder={parent ? "" : "Anweisung oder /"}
          onFocus={() => actions.empty(position(0))}
          readOnly
        />
      )}
      {nodes.map((node, index) => {
        const size = layout.blocks.get(node.id)!;
        return (
          <Fragment key={node.id}>
            <div
              className={`ns-block ns-${node.kind} ${actions.selected === node.id ? "is-selected" : ""} ${node.kind === "statement" && /^return\b/.test(node.text) ? "ns-return" : ""}`}
              data-asymmetric={size.asymmetric || undefined}
              data-block-id={node.id}
              data-dragged={actions.drag.id === node.id || undefined}
              style={
                {
                  "--decision-split": `${(size.left / size.width) * 100}%`,
                } as CSSProperties
              }
            >
              <BlockGrip node={node} actions={actions} />
              <button
                className="block-delete"
                aria-label={`Block löschen: ${node.text || kinds.find((k) => k.kind === node.kind)!.name}`}
                title="Block mit Unterblöcken löschen · Rückgängig mit Strg+Z"
                onClick={() => actions.remove(node.id)}
              >
                <Trash2 size={15} />
              </button>
              {node.kind === "if" ? (
                <>
                  <div className="decision-heading">
                    <BlockLine node={node} actions={actions} />
                    <div className="branch-labels">
                      <button
                        onClick={() => actions.branch(node.id, "children")}
                        aria-label="Ja-Zweig öffnen"
                      >
                        Ja
                      </button>
                      <button
                        onClick={() => actions.branch(node.id, "otherwise")}
                        aria-label="Nein-Zweig öffnen"
                      >
                        Nein
                      </button>
                    </div>
                  </div>
                  <div
                    className="branches"
                    style={{
                      gridTemplateColumns: `${size.left}px ${size.right}px`,
                    }}
                  >
                    {(["children", "otherwise"] as const).map((child) => (
                      <div className="branch" key={child}>
                        <DiagramView
                          nodes={node[child]}
                          actions={actions}
                          parent={node.id}
                          branch={child}
                          layout={layout}
                        />
                      </div>
                    ))}
                  </div>
                </>
              ) : node.kind === "switch" ? (
                <>
                  <div className="switch-heading">
                    <BlockLine node={node} actions={actions} prefix="match" />
                    <button
                      className="add-case"
                      onClick={() =>
                        actions.insert("case", {
                          parent: node.id,
                          branch: "children",
                          index: node.children.length,
                        })
                      }
                    >
                      <Plus size={14} /> Fall
                    </button>
                  </div>
                  <div
                    className="switch-branches"
                    style={{
                      gridTemplateColumns: size
                        .columns!.map((value) => value + "px")
                        .join(" "),
                    }}
                  >
                    {node.children.map((c, index) => (
                      <div className="case-column" key={c.id}>
                        <DiagramView
                          nodes={[c]}
                          actions={actions}
                          parent={node.id}
                          branch="children"
                          offset={index}
                          layout={layout}
                        />
                      </div>
                    ))}
                    <div className="case-column">
                      <button
                        className="default-heading"
                        onClick={() => actions.branch(node.id, "otherwise")}
                      >
                        Sonst
                      </button>
                      <DiagramView
                        nodes={node.otherwise}
                        actions={actions}
                        parent={node.id}
                        branch="otherwise"
                        layout={layout}
                      />
                    </div>
                  </div>
                </>
              ) : node.kind === "case" ? (
                <>
                  <div className="case-heading">
                    <BlockLine node={node} actions={actions} prefix="case" />
                  </div>
                  <DiagramView
                    nodes={node.children}
                    actions={actions}
                    parent={node.id}
                    branch="children"
                    layout={layout}
                  />
                </>
              ) : node.kind === "function" ? (
                <>
                  <FunctionHeader node={node} actions={actions} />
                  <div className="function-body">
                    <DiagramView
                      nodes={node.children}
                      actions={actions}
                      parent={node.id}
                      branch="children"
                      layout={layout}
                    />
                  </div>
                </>
              ) : ["dowhile", "repeat"].includes(node.kind) ? (
                <>
                  <div className="post-loop-cap" aria-hidden="true" />
                  <div className="loop-body">
                    <DiagramView
                      nodes={node.children}
                      actions={actions}
                      parent={node.id}
                      branch="children"
                      layout={layout}
                    />
                  </div>
                  <div className="loop-heading loop-footer">
                    <BlockLine
                      node={node}
                      actions={actions}
                      prefix={node.kind === "repeat" ? "bis" : "solange"}
                    />
                  </div>
                </>
              ) : ["for", "while"].includes(node.kind) ? (
                <>
                  <div className="loop-heading">
                    <BlockLine
                      node={node}
                      actions={actions}
                      prefix={node.kind}
                    />
                  </div>
                  <div className="loop-body">
                    <DiagramView
                      nodes={node.children}
                      actions={actions}
                      parent={node.id}
                      branch="children"
                      layout={layout}
                    />
                  </div>
                  <div className="loop-return" aria-hidden="true" />
                </>
              ) : (
                <BlockLine
                  node={node}
                  actions={actions}
                  prefix={node.kind === "comment" ? "#" : undefined}
                />
              )}
            </div>
            <InsertLine
              position={position(index + 1)}
              actions={actions}
              kind={node.kind === "case" ? "case" : "statement"}
            />
          </Fragment>
        );
      })}
    </div>
  );
}
