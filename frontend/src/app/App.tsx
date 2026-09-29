import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownToLine,
  Braces,
  Check,
  CheckCheck,
  Cloud,
  Code2,
  Copy,
  Eraser,
  FolderOpen,
  GitBranch,
  Keyboard,
  LoaderCircle,
  Menu,
  Moon,
  Pause,
  PanelLeftClose,
  PanelRightClose,
  PanelRightOpen,
  ListTree,
  PawPrint,
  Play,
  Plus,
  Redo2,
  Repeat2,
  Share2,
  Sparkles,
  Square,
  Sun,
  Trash2,
  Undo2,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import CodeMirror from "@uiw/react-codemirror";
import { python } from "@codemirror/lang-python";
import { snippetCompletion, autocompletion } from "@codemirror/autocomplete";
import { Decoration, EditorView } from "@codemirror/view";
import type { Diagram, Kind } from "../features/diagram/model";
import { makeProject } from "../features/projects/model";
import {
  block,
  flatten,
  kinds,
  moveBlock,
  removeBlock,
  updateBlock,
  validDiagram,
} from "../features/diagram/model";
import {
  after,
  enterLine,
  enterBranch,
  eraseEmpty,
  insertAt,
  locate,
  recognizeTyping,
  switchBranch,
  canMoveTo,
  moveTo,
} from "../features/diagram/editing";
import type { Position } from "../features/diagram/editing";
import { download } from "../shared/api";
import { cloudEnabled } from "../shared/config";
import { exportPython as convertToPython } from "../features/python/conversion";
import { useWorkspace } from "../features/projects/useWorkspace";
import { usePythonSync } from "../features/python/usePythonSync";
import { useCanvasZoom } from "../features/diagram/useCanvasZoom";
import { identifierAt, identifiers } from "../features/diagram/language";
import DiagramView from "../features/diagram/DiagramView";
import ProjectDialogs from "../features/projects/ProjectDialogs";
import type { Dialog } from "../features/projects/ProjectDialogs";
import ProjectBrowser from "../features/projects/ProjectBrowser";
import { usePanels } from "./usePanels";

type Theme = "light" | "dark" | "uwu";
type Motion = "system" | "on" | "off";
const icons = {
  statement: Square,
  if: GitBranch,
  while: Repeat2,
  for: Repeat2,
  function: Braces,
  comment: Code2,
  switch: ListTree,
  case: GitBranch,
  dowhile: Repeat2,
  repeat: Repeat2,
};
const snippetExtension = autocompletion({
  override: [
    (context) => {
      const word = context.matchBefore(/\w*/);
      if (!word || (!context.explicit && word.from === word.to)) return null;
      return {
        from: word.from,
        options: [
          snippetCompletion('print("${Text}")', {
            label: "print",
            type: "function",
          }),
          snippetCompletion('input("${Frage}")', {
            label: "input",
            type: "function",
          }),
          snippetCompletion("if ${Bedingung}:\n    ${pass}", {
            label: "if",
            type: "keyword",
          }),
          snippetCompletion("while ${Bedingung}:\n    ${pass}", {
            label: "while",
            type: "keyword",
          }),
          snippetCompletion("for ${i} in range(${10}):\n    ${pass}", {
            label: "for",
            type: "keyword",
          }),
          snippetCompletion("def ${funktion}(${parameter}):\n    ${pass}", {
            label: "def",
            type: "keyword",
          }),
          ...[
            "True",
            "False",
            "None",
            "return",
            "else",
            "elif",
            "break",
            "continue",
            "len",
            "int",
            "str",
            "range",
          ].map((label) => ({ label, type: "keyword" })),
        ],
      };
    },
  ],
});
function preference<T extends string>(
  key: string,
  allowed: T[],
  fallback: T,
): T {
  try {
    const stored = localStorage.getItem(key) as T;
    return allowed.includes(stored) ? stored : fallback;
  } catch {
    return fallback;
  }
}
export default function App() {
  const [toast, setToast] = useState("");
  const notify = useCallback((message: string) => setToast(message), []);
  const w = useWorkspace(notify);
  const sync = usePythonSync(w.active.id, w.active.document, w.changeDocument);
  const [theme, setTheme] = useState<Theme>(() =>
    preference("uwugramm.theme", ["light", "dark", "uwu"], "light"),
  );
  const [motion, setMotion] = useState<Motion>(() =>
    preference("uwugramm.motion.v2", ["system", "on", "off"], "on"),
  );
  const [reduced, setReduced] = useState(
    () => matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const moving = motion === "on" || (motion === "system" && !reduced);
  const [selected, setSelected] = useState("");
  const [cursorName, setCursorName] = useState("");
  const [hoverName, setHoverName] = useState("");
  const activeName = hoverName || cursorName;
  const cursorVariable = useCallback((name: string) => {
    setCursorName(name);
    setHoverName("");
  }, []);
  const variableExtension = useMemo(
    () => [
      EditorView.decorations.of((view) =>
        Decoration.set(
          identifiers(view.state.doc.toString())
            .filter((token) => token.text === activeName)
            .map((token) =>
              Decoration.mark({ class: "variable-match" }).range(
                token.start,
                token.end,
              ),
            ),
        ),
      ),
      EditorView.domEventHandlers({
        mousemove: (event, view) => {
          const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
          setHoverName(
            pos === null ? "" : identifierAt(view.state.doc.toString(), pos),
          );
        },
        mouseleave: () => setHoverName(""),
        blur: () => setCursorName(""),
      }),
    ],
    [activeName],
  );
  const [dialog, setDialog] = useState<Dialog>(null);
  const panels = usePanels();
  const { sideOpen, setSideOpen } = panels;
  const [drag, setDrag] = useState<{ id: string; target?: Position }>({
    id: "",
  });
  const [busy, setBusy] = useState(false);
  const [paperSize, setPaperSize] = useState({ width: 640, height: 100 });
  const canvas = useRef<HTMLDivElement>(null);
  const { zoom, zoomAt } = useCanvasZoom(canvas);
  const paper = useRef<HTMLDivElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const all = flatten(w.active.document.nodes);
  const focus = (id: string, select = false) =>
    requestAnimationFrame(() => {
      const element = document.getElementById(
        id === "diagram" ? id : "block-" + id,
      ) as HTMLInputElement | null;
      element?.focus();
      if (select && element instanceof HTMLInputElement) element.select();
    });
  const change = (doc: Diagram) => {
    if (sync.locked) {
      notify(
        "Bitte vervollständige den Python-Code oder stelle den Diagrammcode wieder her.",
      );
      return false;
    }
    if (!validDiagram(doc)) {
      notify("Maximal 500 Blöcke, 20 Ebenen und 200 KB.");
      return false;
    }
    w.changeDocument(doc);
    return true;
  };
  const applyEdit = (
    result: { document: Diagram; focus: string } | undefined,
  ) => {
    if (!result) return;
    if (result.document === w.active.document || change(result.document)) {
      setSelected(result.focus);
      focus(result.focus);
    }
  };
  const insert = (
    kind: Kind,
    position = after(w.active.document, selected),
  ) => {
    const fresh = block(kind);
    if (change(insertAt(w.active.document, fresh, position))) {
      setSelected(fresh.id);
      focus(fresh.id);
    }
  };
  const text = (id: string, value: string) => {
    const old = locate(w.active.document, id)?.node;
    if (!old) return;
    const node =
      value.startsWith("#") && old.kind === "statement"
        ? { ...old, kind: "comment" as const, text: value.slice(1).trimStart() }
        : recognizeTyping(old, value);
    const field = document.getElementById(
      "block-" + id,
    ) as HTMLTextAreaElement | null;
    const caret = field?.selectionStart ?? value.length;
    if (
      change(updateBlock(w.active.document, id, () => node)) &&
      node.kind !== old.kind
    )
      requestAnimationFrame(() => {
        const next = document.getElementById(
          "block-" + id,
        ) as HTMLTextAreaElement | null;
        next?.focus();
        const position = Math.max(0, caret - (value.length - node.text.length));
        next?.setSelectionRange(position, position);
      });
  };
  const createProject = () => {
    w.add();
    if (matchMedia("(max-width: 1000px)").matches) setSideOpen(false);
  };
  const deleteBlock = (id: string) => {
    if (change(removeBlock(w.active.document, id))) {
      setSelected("");
      focus("diagram");
    }
  };
  const exportJson = () =>
    download(
      w.active.title + ".uwu.json",
      JSON.stringify(
        { title: w.active.title, document: w.active.document },
        null,
        2,
      ),
      "application/json",
    );
  const exportPython = async () => {
    if (sync.locked) {
      download(w.active.title + ".py", sync.source, "text/x-python");
      return;
    }
    setBusy(true);
    try {
      const result = await convertToPython(w.active.document);
      download(w.active.title + ".py", result.source, "text/x-python");
    } catch (err) {
      notify((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const copyText = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      notify("Kopiert.");
    } catch {
      notify("Bitte mit Strg+C kopieren.");
    }
  };

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("uwugramm.theme", theme);
    } catch {}
  }, [theme]);
  useEffect(() => {
    document.documentElement.dataset.motion = motion;
    try {
      localStorage.setItem("uwugramm.motion.v2", motion);
    } catch {}
  }, [motion]);
  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 6000);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    setSelected("");
    if (canvas.current) {
      canvas.current.scrollLeft = 0;
      canvas.current.scrollTop = 0;
    }
  }, [w.active.id]);
  useEffect(() => {
    if (selected && !locate(w.active.document, selected)) setSelected("");
  }, [w.active.document, selected]);
  useEffect(() => {
    if (!paper.current) return;
    const observer = new ResizeObserver(() => {
      const node = paper.current!;
      setPaperSize({ width: node.offsetWidth, height: node.offsetHeight });
    });
    observer.observe(paper.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const auth = new URLSearchParams(location.search).get("auth");
    if (auth) {
      notify(
        auth === "unconfigured"
          ? "Google-Anmeldung ist noch nicht eingerichtet."
          : "Anmeldung fehlgeschlagen. Bitte versuche es erneut.",
      );
      history.replaceState({}, "", location.pathname);
    }
  }, [notify]);
  useEffect(() => {
    const before = (event: BeforeUnloadEvent) => {
      if (sync.unsaved || w.projects.some((p) => p.cloud && p.dirty))
        event.preventDefault();
    };
    window.addEventListener("beforeunload", before);
    return () => window.removeEventListener("beforeunload", before);
  }, [sync.unsaved, w.projects]);
  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      if (dialog) return;
      const mod = event.ctrlKey || event.metaKey;
      const editing = (event.target as HTMLElement)?.matches(
        'input,textarea,[contenteditable="true"]',
      );
      if (mod && event.key.toLowerCase() === "s") {
        event.preventDefault();
        if (!sync.locked) void w.save();
      }
      if (
        (!editing || (event.target as HTMLElement)?.id?.startsWith("block-")) &&
        mod &&
        event.key.toLowerCase() === "z"
      ) {
        event.preventDefault();
        if (!sync.locked) (event.shiftKey ? w.redo : w.undo)();
      }
      if (
        !editing &&
        (event.key === "Delete" || event.key === "Backspace") &&
        selected
      ) {
        event.preventDefault();
        if (change(removeBlock(w.active.document, selected))) {
          setSelected("");
          focus("diagram");
        }
      }
      if (!editing && event.key === "?") setDialog("help");
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  });

  return (
    <div className="app-shell compact">
      <a className="skip-link" href="#diagram">
        Zum Diagramm
      </a>
      <header className="topbar">
        <button
          className="icon-button sidebar-toggle"
          aria-label={
            sideOpen
              ? "Projekte und Bausteine einklappen"
              : "Projekte und Bausteine anzeigen"
          }
          aria-expanded={sideOpen}
          aria-controls="project-sidebar"
          onClick={() => setSideOpen(!sideOpen)}
        >
          {sideOpen ? <PanelLeftClose size={19} /> : <Menu size={19} />}
        </button>
        <input
          className="project-title"
          aria-label="Projektname"
          maxLength={100}
          value={w.active.title}
          onChange={(e) => w.rename(e.target.value)}
          onBlur={() => {
            if (!w.active.title.trim()) w.rename("Unbenanntes Projekt");
          }}
        />
        <div className="project-controls">
          <button className="toolbar-button" onClick={createProject}>
            <Plus size={17} />
            <span>Neu</span>
          </button>
          <button
            className="toolbar-button"
            onClick={() => setDialog("clear")}
            disabled={sync.locked}
          >
            <Eraser size={17} />
            <span>Leeren</span>
          </button>
          <button
            className="icon-button"
            aria-label="Projekt löschen"
            title="Projekt löschen"
            onClick={() => setDialog("delete")}
          >
            <Trash2 size={17} />
          </button>
        </div>
        <div className="history-buttons">
          <button
            className="icon-button"
            aria-label="Rückgängig"
            disabled={sync.locked || !w.history.past.length}
            onClick={w.undo}
          >
            <Undo2 size={18} />
          </button>
          <button
            className="icon-button"
            aria-label="Wiederholen"
            disabled={sync.locked || !w.history.future.length}
            onClick={w.redo}
          >
            <Redo2 size={18} />
          </button>
        </div>
        <div className="top-actions">
          <button
            id="python-toggle"
            className="icon-button"
            aria-label={
              panels.codeOpen
                ? "Python-Bereich einklappen"
                : "Python-Bereich anzeigen"
            }
            title={
              panels.codeOpen
                ? "Python-Bereich einklappen"
                : "Python-Bereich anzeigen"
            }
            aria-expanded={panels.codeOpen}
            aria-controls="python-panel"
            onClick={() => panels.setCodeOpen(!panels.codeOpen)}
          >
            {panels.codeOpen ? (
              <PanelRightClose size={18} />
            ) : (
              <PanelRightOpen size={18} />
            )}
          </button>
          <button
            className="icon-button"
            aria-label="Projekt speichern"
            title={w.saveState || "Projekt speichern"}
            disabled={w.saving || sync.locked}
            onClick={() => void w.save()}
          >
            {w.saving ? (
              <LoaderCircle size={18} className="spin" />
            ) : w.active.cloud ? (
              <Cloud size={18} />
            ) : (
              <CheckCheck size={18} />
            )}
          </button>
          {cloudEnabled && (
            <button
              className="toolbar-button"
              disabled={sync.locked}
              onClick={() => setDialog("share")}
            >
              <Share2 size={16} />
              <span>Teilen</span>
            </button>
          )}
          <div className="theme-switch" aria-label="Darstellung">
            <button
              aria-label="Helles Theme"
              aria-pressed={theme === "light"}
              onClick={() => setTheme("light")}
            >
              <Sun size={17} />
            </button>
            <button
              aria-label="Dunkles Theme"
              aria-pressed={theme === "dark"}
              onClick={() => setTheme("dark")}
            >
              <Moon size={17} />
            </button>
            <button
              className="uwu-button"
              aria-label="UwU-Theme"
              aria-pressed={theme === "uwu"}
              onClick={() => setTheme("uwu")}
            >
              <PawPrint size={17} />
              <span>uwu</span>
              <Sparkles className="button-sparkle" size={14} />
            </button>
          </div>
          {theme === "uwu" && (
            <button
              className="icon-button motion-button"
              aria-label={
                moving
                  ? "Pet-Animationen pausieren"
                  : "Pet-Animationen abspielen"
              }
              onClick={() => setMotion(moving ? "off" : "on")}
            >
              {moving ? <Pause size={16} /> : <Play size={16} />}
            </button>
          )}
          {cloudEnabled ? (
            <button
              className="account-button"
              aria-label={
                w.session.authenticated ? "Konto öffnen" : "Mit Google anmelden"
              }
              onClick={() => setDialog("account")}
            >
              {w.session.authenticated ? (
                <span className="avatar">U</span>
              ) : (
                <>
                  <span className="google-g">G</span>
                  <span>Anmelden</span>
                </>
              )}
            </button>
          ) : (
            <span className="local-mode-label">Nur lokal</span>
          )}
        </div>
      </header>
      <div className="workspace-body">
        <aside
          className={`sidebar ${sideOpen ? "mobile-open" : ""}`}
          id="project-sidebar"
          hidden={!sideOpen}
          aria-label="Projekte und Bausteine"
        >
          <input
            className="mobile-project-name"
            aria-label="Projektname"
            maxLength={100}
            value={w.active.title}
            onChange={(e) => w.rename(e.target.value)}
            onBlur={() => {
              if (!w.active.title.trim()) w.rename("Unbenanntes Projekt");
            }}
          />
          <ProjectBrowser
            w={w}
            notify={notify}
            onSelect={() => {
              if (matchMedia("(max-width: 1000px)").matches) setSideOpen(false);
            }}
          />
          {cloudEnabled && (
            <button className="subtle-button" onClick={() => setDialog("copy")}>
              <Share2 size={15} />
              Code einlösen
            </button>
          )}
          <div className="sidebar-rule" />
          <div className="section-label">Bausteine</div>
          <div className="block-palette">
            {kinds
              .filter((kind) => kind.kind !== "case")
              .map((kind) => {
                const Icon = icons[kind.kind];
                return (
                  <button
                    key={kind.kind}
                    className="palette-block"
                    disabled={sync.locked}
                    onClick={() => insert(kind.kind)}
                  >
                    <span className={`block-icon ${kind.kind}`}>
                      <Icon size={17} />
                    </span>
                    <span>{kind.name}</span>
                  </button>
                );
              })}
          </div>
          <div className="sidebar-bottom">
            <button
              className="subtle-button"
              onClick={() => file.current?.click()}
            >
              <FolderOpen size={16} />
              Projekt importieren
            </button>
            <button className="subtle-button" onClick={exportJson}>
              <ArrowDownToLine size={16} />
              Projekt exportieren
            </button>
            <button
              className="subtle-button"
              onClick={() =>
                w.add({
                  ...makeProject(),
                  title: w.active.title.slice(0, 85) + " · Kopie",
                  document: structuredClone(w.active.document),
                })
              }
            >
              <Copy size={16} />
              Kopie erstellen
            </button>
            <button className="subtle-button" onClick={() => setDialog("help")}>
              <Keyboard size={16} />
              Tastatur & Darstellung
            </button>
          </div>
        </aside>
        <main className="main-workspace">
          <div
            ref={panels.split}
            className={`editor-split ${panels.codeOpen ? "" : "code-collapsed"} ${panels.resizing ? "panel-resizing" : ""} ${drag.id ? "block-dragging" : ""}`}
            style={{ "--code-size": panels.size + "px" } as React.CSSProperties}
          >
            <section
              className="canvas-section"
              aria-label="Struktogramm-Editor"
            >
              <div
                ref={canvas}
                className="canvas-scroll"
                aria-label="Diagramm-Arbeitsfläche"
              >
                <div
                  className="diagram-stage"
                  style={{
                    width: paperSize.width * zoom,
                    height: paperSize.height * zoom,
                  }}
                >
                  <div
                    ref={paper}
                    className="diagram-paper"
                    id="diagram"
                    tabIndex={0}
                    style={{ transform: `scale(${zoom})` }}
                  >
                    <fieldset
                      disabled={sync.locked}
                      aria-label="Diagramm bearbeiten"
                    >
                      <DiagramView
                        nodes={w.active.document.nodes}
                        actions={{
                          activeName,
                          hoverName: setHoverName,
                          cursorName: cursorVariable,
                          selected,
                          select: setSelected,
                          text,
                          insert,
                          remove: deleteBlock,
                          branch: (id, branch) =>
                            applyEdit(
                              enterBranch(w.active.document, id, branch),
                            ),
                          drag: {
                            ...drag,
                            start: (id) => {
                              setSelected(id);
                              setDrag({ id });
                            },
                            end: () => setDrag({ id: "" }),
                            canDrop: (target, id) =>
                              canMoveTo(
                                w.active.document,
                                id || drag.id,
                                target,
                              ),
                            over: (target) =>
                              setDrag((current) =>
                                current.target?.parent === target?.parent &&
                                current.target?.branch === target?.branch &&
                                current.target?.index === target?.index
                                  ? current
                                  : { ...current, target },
                              ),
                            drop: (target, id) => {
                              const document = moveTo(
                                w.active.document,
                                id || drag.id,
                                target,
                              );
                              if (
                                document !== w.active.document &&
                                change(document)
                              ) {
                                setSelected(id || drag.id);
                                focus(id || drag.id);
                              }
                              setDrag({ id: "" });
                            },
                          },
                          enter: (id, outside) =>
                            applyEdit(
                              enterLine(w.active.document, id, outside),
                            ),
                          tab: (id, backward) => {
                            const result = switchBranch(
                              w.active.document,
                              id,
                              backward,
                            );
                            if (!result) return false;
                            applyEdit(result);
                            return true;
                          },
                          erase: (id) =>
                            applyEdit(eraseEmpty(w.active.document, id)),
                          navigate: (id, direction) => {
                            const location = locate(w.active.document, id);
                            if (
                              direction === 1 &&
                              location &&
                              [
                                "if",
                                "while",
                                "for",
                                "function",
                                "switch",
                                "case",
                                "dowhile",
                                "repeat",
                              ].includes(location.node.kind) &&
                              !location.node.children.length
                            ) {
                              applyEdit(enterLine(w.active.document, id));
                              return;
                            }
                            const next =
                              all[
                                all.findIndex((n) => n.id === id) + direction
                              ];
                            if (next) {
                              setSelected(next.id);
                              focus(next.id);
                            }
                          },
                          move: (id, direction) => {
                            if (
                              change(
                                moveBlock(w.active.document, id, direction),
                              )
                            )
                              focus(id);
                          },
                          empty: (position) => insert("statement", position),
                        }}
                      />
                    </fieldset>
                  </div>
                </div>
              </div>
              <div className="canvas-tools">
                <div className="zoom-control">
                  <button
                    aria-label="Verkleinern"
                    disabled={zoom <= 0.35}
                    onClick={() => zoomAt(zoom - 0.1)}
                  >
                    <ZoomOut size={17} />
                  </button>
                  <button
                    aria-label="Zoom zurücksetzen"
                    onClick={() => zoomAt(1)}
                  >
                    {Math.round(zoom * 100)}%
                  </button>
                  <button
                    aria-label="Vergrößern"
                    disabled={zoom >= 2.5}
                    onClick={() => zoomAt(zoom + 0.1)}
                  >
                    <ZoomIn size={17} />
                  </button>
                </div>
                {selected && (
                  <button
                    className="icon-button"
                    aria-label="Ausgewählten Block löschen"
                    disabled={sync.locked}
                    onClick={() => {
                      if (change(removeBlock(w.active.document, selected))) {
                        setSelected("");
                        focus("diagram");
                      }
                    }}
                  >
                    <Trash2 size={17} />
                  </button>
                )}
              </div>
              {sync.locked && (
                <div className="sync-lock" role="status">
                  {sync.pending ? (
                    <>
                      <LoaderCircle size={16} className="spin" />
                      Python wird geprüft …
                    </>
                  ) : (
                    <>
                      Python enthält einen Fehler.{" "}
                      <button onClick={sync.reset}>
                        Diagrammcode wiederherstellen
                      </button>
                    </>
                  )}
                </div>
              )}
              {theme === "uwu" && (
                <div className="pet-track" aria-hidden="true">
                  <div className="pet-route cat-route">
                    <div className="pet-sprite cat-sprite" />
                  </div>
                  <div className="pet-route bunny-route">
                    <div className="pet-sprite bunny-sprite" />
                  </div>
                </div>
              )}
            </section>
            {panels.codeOpen && (
              <div className="panel-separator" {...panels.separator} />
            )}
            <aside
              id="python-panel"
              hidden={!panels.codeOpen}
              className="inspector"
              aria-label="Python-Code"
            >
              <div className="code-heading">
                <span>
                  <Code2 size={17} />
                  Python
                </span>
                <div>
                  <button
                    className="icon-button"
                    aria-label="Python-Panel schließen"
                    title="Python einklappen"
                    onClick={() => {
                      panels.setCodeOpen(false);
                      document.getElementById("python-toggle")?.focus();
                    }}
                  >
                    <PanelRightClose size={17} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label="Python kopieren"
                    onClick={() => void copyText(sync.source)}
                  >
                    <Copy size={16} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label="Python herunterladen"
                    disabled={busy}
                    onClick={() => void exportPython()}
                  >
                    <ArrowDownToLine size={17} />
                  </button>
                </div>
              </div>
              <CodeMirror
                className="code-editor"
                value={sync.source}
                extensions={[
                  python(),
                  snippetExtension,
                  EditorView.lineWrapping,
                  variableExtension,
                ]}
                theme={theme === "dark" ? "dark" : "light"}
                onChange={(value, update) => {
                  if (
                    update.docChanged &&
                    update.transactions.some(
                      (transaction) =>
                        transaction.isUserEvent("input") ||
                        transaction.isUserEvent("delete") ||
                        transaction.isUserEvent("undo") ||
                        transaction.isUserEvent("redo"),
                    )
                  )
                    sync.edit(value);
                }}
                onUpdate={(update) => {
                  if (
                    update.view.hasFocus &&
                    (update.selectionSet || update.docChanged)
                  )
                    cursorVariable(
                      identifierAt(
                        update.state.doc.toString(),
                        update.state.selection.main.head,
                      ),
                    );
                }}
                basicSetup={{
                  foldGutter: false,
                  lineNumbers: true,
                  highlightActiveLine: true,
                }}
                aria-label="Python bearbeiten"
              />
              {sync.error && (
                <div className="python-error" role="alert">
                  <p>{sync.error}</p>
                  <button className="secondary-button" onClick={sync.retry}>
                    Erneut prüfen
                  </button>
                  <button className="subtle-button" onClick={sync.reset}>
                    Diagrammcode wiederherstellen
                  </button>
                </div>
              )}
              {sync.warning && (
                <p className="python-warning" role="status">
                  {sync.warning}
                </p>
              )}
            </aside>
          </div>
        </main>
      </div>
      <input
        ref={file}
        type="file"
        accept=".json,.uwu.json"
        hidden
        onChange={async (event) => {
          const chosen = event.target.files?.[0];
          event.target.value = "";
          if (!chosen) return;
          try {
            if (chosen.size > 262144) throw new Error("Maximal 256 KB.");
            const data = JSON.parse(await chosen.text());
            if (!validDiagram(data.document) || typeof data.title !== "string")
              throw new Error("Ungültige Projektdatei.");
            w.add({
              ...makeProject(),
              title: data.title.slice(0, 100) || "Import",
              document: data.document,
            });
          } catch (err) {
            notify((err as Error).message);
          }
        }}
      />
      {dialog && (
        <ProjectDialogs
          key={dialog + w.active.id}
          dialog={dialog}
          setDialog={setDialog}
          w={w}
          notify={notify}
          clear={() => {
            sync.reset();
            w.changeDocument({ version: 1, nodes: [] });
            setSelected("");
          }}
          motion={motion}
          setMotion={setMotion}
          copyText={(value) => void copyText(value)}
        />
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={17} />
          <span>{toast}</span>
          <button aria-label="Hinweis schließen" onClick={() => setToast("")}>
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
