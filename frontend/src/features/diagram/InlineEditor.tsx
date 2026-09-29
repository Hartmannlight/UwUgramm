import { useMemo, useRef } from "react";
import type { KeyboardEvent } from "react";
import { identifierAt, identifiers } from "./language";
interface Props {
  id: string;
  value: string;
  label: string;
  placeholder?: string;
  parameters?: boolean;
  activeName: string;
  hoverName: (name: string) => void;
  cursorName: (name: string) => void;
  onChange: (value: string) => void;
  onFocus: () => void;
  onBlur?: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  expanded?: boolean;
  controls?: string;
  activeOption?: string;
}
/** The mirror has exactly the textarea's font and wrapping, so its caret row is measurable. */
export function atVisualEdge(
  field: HTMLTextAreaElement,
  direction: -1 | 1,
): boolean {
  if (field.selectionStart !== field.selectionEnd) return false;
  const mirror = field.previousElementSibling;
  if (!mirror) return false;
  let offset = field.selectionStart;
  const walker = document.createTreeWalker(mirror, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const length = node.textContent?.length || 0;
    if (offset <= length) {
      const range = document.createRange();
      range.setStart(node, offset);
      range.collapse(true);
      const caret = range.getBoundingClientRect();
      const bounds = mirror.getBoundingClientRect();
      const row =
        parseFloat(getComputedStyle(field).lineHeight) *
        (field.getBoundingClientRect().height / field.offsetHeight);
      return direction === -1
        ? caret.top - bounds.top < row
        : bounds.bottom - caret.bottom < row;
    }
    offset -= length;
    node = walker.nextNode();
  }
  return true;
}
export default function InlineEditor(props: Props) {
  const mirror = useRef<HTMLDivElement>(null);
  const source = props.parameters ? `f(${props.value})` : props.value;
  const offset = props.parameters ? 2 : 0;
  const segments = useMemo(() => {
    const matches = identifiers(source, props.parameters).filter(
      (t) => t.start >= offset && t.end <= props.value.length + offset,
    );
    const result: { text: string; start: number; name?: string }[] = [];
    let position = 0;
    for (const token of matches) {
      const start = token.start - offset,
        end = token.end - offset;
      if (start > position)
        result.push({
          text: props.value.slice(position, start),
          start: position,
        });
      result.push({ text: token.text, start, name: token.text });
      position = end;
    }
    if (position < props.value.length)
      result.push({ text: props.value.slice(position), start: position });
    return result;
  }, [source, offset, props.value, props.parameters]);
  const atCursor = (position: number) =>
    identifierAt(source, position + offset, props.parameters);
  return (
    <div className="line-editor" onMouseLeave={() => props.hoverName("")}>
      <div ref={mirror} className="line-render" aria-hidden="true">
        {props.value ? (
          segments.map((token) => (
            <span
              key={token.start}
              data-variable={token.name}
              className={
                token.name
                  ? `variable-token ${props.activeName === token.name ? "variable-match" : ""}`
                  : undefined
              }
            >
              {token.text}
            </span>
          ))
        ) : (
          <span className="line-placeholder">{props.placeholder || " "}</span>
        )}
        {"\u200b"}
      </div>
      <textarea
        id={props.id}
        aria-label={props.label}
        value={props.value}
        rows={1}
        wrap="soft"
        maxLength={2000}
        spellCheck={false}
        autoComplete="off"
        onChange={(event) =>
          props.onChange(event.target.value.replace(/[\r\n]+/g, " "))
        }
        onFocus={(event) => {
          props.onFocus();
          props.cursorName(atCursor(event.target.selectionStart));
        }}
        onBlur={() => {
          props.cursorName("");
          props.onBlur?.();
        }}
        onSelect={(event) =>
          props.cursorName(atCursor(event.currentTarget.selectionStart))
        }
        onMouseMove={(event) => {
          const match = [
            ...mirror.current!.querySelectorAll<HTMLElement>("[data-variable]"),
          ].find((span) =>
            [...span.getClientRects()].some(
              (rect) =>
                event.clientX >= rect.left &&
                event.clientX <= rect.right &&
                event.clientY >= rect.top &&
                event.clientY <= rect.bottom,
            ),
          );
          props.hoverName(match?.dataset.variable || "");
        }}
        onKeyDown={props.onKeyDown}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={!!props.expanded}
        aria-controls={props.controls}
        aria-activedescendant={props.activeOption}
      />
    </div>
  );
}
