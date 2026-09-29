"""Syntax-only conversion. User code is never evaluated or executed."""

import ast
import copy
import io
import tokenize
from uuid import uuid4

from ..schema import Document, Node
from .type_names import python_text


class ConversionError(ValueError):
    def __init__(self, message: str, line: int | None = None):
        self.line = line
        super().__init__(message)


def parse_python(source: str) -> dict:
    try:
        tree = ast.parse(source)
        compile(tree, "<import>", "exec")
    except (SyntaxError, ValueError, RecursionError) as exc:
        raise ConversionError("Python konnte nicht gelesen werden: " + str(exc), getattr(exc, "lineno", None))
    if sum(1 for _ in ast.walk(tree)) > 12_000:
        raise ConversionError("Dieser Python-Code ist zu komplex.")
    lines = source.splitlines()
    comments: dict[int, tuple[int, str]] = {}
    has_inline_comments = False
    for token in tokenize.generate_tokens(io.StringIO(source).readline):
        if token.type == tokenize.COMMENT:
            lineno, col = token.start
            if not lines[lineno - 1][:col].strip():
                comments[lineno] = (col, token.string[1:].lstrip())
            else:
                has_inline_comments = True

    def node(kind, text, children=None, otherwise=None):
        return Node(id=uuid4().hex, kind=kind, text=text, children=children or [], otherwise=otherwise or [])

    def sequence(items, start, end, indent=0, depth=0):
        if depth > 20:
            raise ConversionError("Maximal 20 Verschachtelungen erlaubt.")
        result: list[Node] = []
        cursor = start
        for item in items:
            assert item.end_lineno is not None
            result.extend(
                node("comment", text)
                for n, (col, text) in comments.items()
                if cursor <= n < item.lineno and col == indent
            )
            if isinstance(item, ast.If):
                boundary = item.orelse[0].lineno if item.orelse else item.end_lineno + 1
                result.append(
                    node(
                        "if",
                        ast.unparse(item.test),
                        sequence(item.body, item.lineno + 1, boundary, item.body[0].col_offset, depth + 1),
                        sequence(
                            item.orelse,
                            boundary,
                            item.end_lineno + 1,
                            item.orelse[0].col_offset if item.orelse else indent + 4,
                            depth + 1,
                        ),
                    )
                )
            elif isinstance(item, ast.Match):
                cases = []
                otherwise = []
                for case in item.cases:
                    assert case.body[-1].end_lineno is not None
                    body = sequence(
                        case.body,
                        case.pattern.lineno + 1,
                        case.body[-1].end_lineno + 1,
                        case.body[0].col_offset,
                        depth + 2,
                    )
                    if (
                        isinstance(case.pattern, ast.MatchAs)
                        and case.pattern.pattern is None
                        and case.pattern.name is None
                        and case.guard is None
                    ):
                        otherwise = body
                    else:
                        pattern = ast.unparse(case.pattern)
                        if case.guard:
                            pattern += " if " + ast.unparse(case.guard)
                        cases.append(node("case", pattern, body))
                result.append(node("switch", ast.unparse(item.subject), cases, otherwise))
            elif isinstance(item, (ast.While, ast.For)):
                if item.orelse:
                    raise ConversionError("Schleifen mit else werden noch nicht unterstützt.", item.lineno)
                text = (
                    ast.unparse(item.test)
                    if isinstance(item, ast.While)
                    else f"{ast.unparse(item.target)} in {ast.unparse(item.iter)}"
                )
                body_items = item.body
                loop_kind = "while" if isinstance(item, ast.While) else "for"
                # Recognize an end-tested loop only when every continue checks
                # the same stop condition; unguarded continues retain while semantics.
                if (
                    isinstance(item, ast.While)
                    and isinstance(item.test, ast.Constant)
                    and item.test.value is True
                    and len(item.body) > 1
                ):
                    tail = item.body[-1]
                    restored, safe = (
                        restore_post_continues(copy.deepcopy(item.body[:-1]), tail.test)
                        if isinstance(tail, ast.If)
                        else ([], False)
                    )
                    if (
                        isinstance(tail, ast.If)
                        and not tail.orelse
                        and len(tail.body) == 1
                        and isinstance(tail.body[0], ast.Break)
                        and safe
                    ):
                        condition = tail.test
                        loop_kind = "repeat"
                        if isinstance(condition, ast.UnaryOp) and isinstance(condition.op, ast.Not):
                            condition, loop_kind = condition.operand, "dowhile"
                        text = ast.unparse(condition)
                        body_items = restored
                assert body_items[-1].end_lineno is not None
                result.append(
                    node(
                        loop_kind,
                        text,
                        sequence(
                            body_items,
                            item.lineno + 1,
                            body_items[-1].end_lineno + 1,
                            item.body[0].col_offset,
                            depth + 1,
                        ),
                    )
                )
            elif isinstance(item, ast.FunctionDef):
                if item.decorator_list or item.type_params:
                    raise ConversionError(
                        "Dekoratoren und generische Funktionen werden noch nicht unterstützt.", item.lineno
                    )
                signature = f"{item.name}({ast.unparse(item.args)})"
                if item.returns:
                    signature += f" -> {ast.unparse(item.returns)}"
                result.append(
                    node(
                        "function",
                        signature,
                        sequence(
                            item.body,
                            item.lineno + 1,
                            item.end_lineno + 1,
                            item.body[0].col_offset,
                            depth + 1,
                        ),
                    )
                )
            elif isinstance(
                item,
                (
                    ast.Assign,
                    ast.AnnAssign,
                    ast.AugAssign,
                    ast.Expr,
                    ast.Return,
                    ast.Break,
                    ast.Continue,
                    ast.Pass,
                    ast.Import,
                    ast.ImportFrom,
                    ast.Raise,
                    ast.Assert,
                    ast.Delete,
                    ast.Global,
                    ast.Nonlocal,
                ),
            ):
                result.append(node("statement", "" if isinstance(item, ast.Pass) else ast.unparse(item)))
            else:
                raise ConversionError(
                    f"{type(item).__name__} wird noch nicht unterstützt. Dein Diagramm bleibt unverändert.",
                    item.lineno,
                )
            cursor = item.end_lineno + 1
        result.extend(
            node("comment", text)
            for n, (col, text) in comments.items()
            if cursor <= n < end and col == indent
        )
        return result

    doc = Document(nodes=sequence(tree.body, 1, len(lines) + 1))
    preserved = sum(1 for n in flatten(doc.nodes) if n.kind == "comment")
    warnings = []
    if has_inline_comments or preserved < len(comments):
        warnings.append(
            "Inline-Kommentare oder Kommentare innerhalb von Ausdrücken konnten nicht übernommen werden."
        )
    return {"document": doc.model_dump(), "warnings": warnings}


def flatten(nodes):
    for node in nodes:
        yield node
        yield from flatten(node.children)
        yield from flatten(node.otherwise)


def restore_post_continues(items, test):
    """Recognize guarded continues; ordinary while-True loops retain their semantics."""
    result: list[ast.stmt] = []
    safe = True
    for item in items:
        if isinstance(item, ast.Continue):
            guard = result[-1] if result else None
            if (
                isinstance(guard, ast.If)
                and not guard.orelse
                and len(guard.body) == 1
                and isinstance(guard.body[0], ast.Break)
                and ast.dump(guard.test) == ast.dump(test)
            ):
                result.pop()
            else:
                safe = False
        if isinstance(item, ast.If):
            item.body, valid = restore_post_continues(item.body, test)
            safe &= valid
            item.orelse, valid = restore_post_continues(item.orelse, test)
            safe &= valid
        elif isinstance(item, ast.Match):
            for case in item.cases:
                case.body, valid = restore_post_continues(case.body, test)
                safe &= valid
        result.append(item)
    return result, safe


def export_python(document: Document) -> str:
    def sequence(nodes, level, continue_test=None):
        lines: list[str] = []
        prefix = "    " * level
        has_statement = False
        for node in nodes:
            value = python_text(node.text, node.kind)
            if node.kind == "comment":
                lines.extend(prefix + "# " + line for line in value.splitlines() or [""])
                continue
            if node.kind == "statement" and not value:
                continue
            has_statement = True
            if node.kind == "statement":
                if value == "continue" and continue_test:
                    lines.extend([f"{prefix}if {continue_test}:", prefix + "    break", prefix + "continue"])
                else:
                    lines.extend(prefix + line for line in value.splitlines())
            elif node.kind == "switch":
                lines.append(f"{prefix}match {value or 'wert'}:")
                for case in node.children:
                    lines.append(f"{prefix}    case {python_text(case.text, 'case') or '1'}:")
                    lines.extend(sequence(case.children, level + 2, continue_test))
                if not node.children or any(n.kind != "statement" or n.text.strip() for n in node.otherwise):
                    lines.append(f"{prefix}    case _:")
                    lines.extend(sequence(node.otherwise, level + 2, continue_test))
            elif node.kind in ("dowhile", "repeat"):
                condition = value or ("False" if node.kind == "repeat" else "True")
                stop = f"not ({condition})" if node.kind == "dowhile" else condition
                body = sequence(node.children, level + 1, stop)
                lines.extend(
                    [prefix + "while True:", *body, f"{prefix}    if {stop}:", prefix + "        break"]
                )
            elif node.kind == "case":
                raise ConversionError("Ein Fall benötigt eine Mehrfachauswahl.")
            else:
                word = "def" if node.kind == "function" else node.kind
                default = {"if": "True", "while": "True", "for": "item in items", "function": "funktion()"}[
                    node.kind
                ]
                lines.append(f"{prefix}{word} {value or default}:")
                lines.extend(sequence(node.children, level + 1, continue_test if node.kind == "if" else None))
                if node.kind == "if" and any(n.kind != "statement" or n.text.strip() for n in node.otherwise):
                    lines.append(prefix + "else:")
                    lines.extend(sequence(node.otherwise, level + 1, continue_test))
        if not has_statement and level > 0:
            lines.append(prefix + "pass")
        return lines

    lines = sequence(document.nodes, 0)
    source = "\n".join(lines) + "\n" if lines else ""
    try:
        ast.parse(source)
        # compile checks context (return/break), but never runs code.
        compile(source, "<struktogramm>", "exec")
    except (SyntaxError, ValueError, RecursionError) as exc:
        raise ConversionError("Bitte prüfe deine Python-Ausdrücke: " + str(exc), getattr(exc, "lineno", None))
    # Ensure fields cannot smuggle extra compound statements across tree boundaries.
    for n in flatten(document.nodes):
        if n.kind != "comment" and ("\n" in n.text or "\r" in n.text):
            raise ConversionError("Ein Block darf nur eine Zeile enthalten.")
        if n.kind == "statement":
            parsed = ast.parse(python_text(n.text, n.kind) or "pass")
            if len(parsed.body) != 1 or isinstance(
                parsed.body[0],
                (
                    ast.If,
                    ast.For,
                    ast.While,
                    ast.FunctionDef,
                    ast.ClassDef,
                    ast.With,
                    ast.Try,
                    ast.TryStar,
                    ast.Match,
                    ast.AsyncFor,
                    ast.AsyncWith,
                    ast.AsyncFunctionDef,
                ),
            ):
                raise ConversionError("Verwende für Kontrollstrukturen den passenden Baustein.")
    return source
