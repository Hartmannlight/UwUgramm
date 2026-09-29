"""Translate documented editor shorthand only within Python type annotations."""

import ast
import io
import re
import tokenize

ALIASES = {
    "gz": "int",
    "ganzzahl": "int",
    "integer": "int",
    "int": "int",
    "rz": "float",
    "fz": "float",
    "fkz": "float",
    "double": "float",
    "gleitkommazahl": "float",
    "fliesskommazahl": "float",
    "fließkomma": "float",
    "fliesskomma": "float",
    "gleitkomma": "float",
    "ganzzahlig": "int",
    "long": "int",
    "short": "int",
    "real": "float",
    "float": "float",
    "kommazahl": "float",
    "fließkommazahl": "float",
    "zk": "str",
    "text": "str",
    "string": "str",
    "zeichenkette": "str",
    "zeichen": "str",
    "char": "str",
    "str": "str",
    "ww": "bool",
    "boolean": "bool",
    "booleansch": "bool",
    "boolesch": "bool",
    "boolscher": "bool",
    "wahrheitswert": "bool",
    "bool": "bool",
    "liste": "list",
    "list": "list",
    "menge": "set",
    "set": "set",
    "tupel": "tuple",
    "tuple": "tuple",
    "wörterbuch": "dict",
    "woerterbuch": "dict",
    "dictionary": "dict",
    "dict": "dict",
    "void": "None",
    "nichts": "None",
    "none": "None",
}


def expression(source: str, condition=False) -> str:
    words = {"und": "and", "oder": "or", "nicht": "not", "wahr": "True", "falsch": "False"}
    if condition:
        words["gleich"] = "=="
    edits = []
    previous = ""
    fstrings = 0
    try:
        for token in tokenize.generate_tokens(io.StringIO(source).readline):
            name = tokenize.tok_name[token.type]
            if name == "FSTRING_START":
                fstrings += 1
            if fstrings:
                if name == "FSTRING_END":
                    fstrings -= 1
                continue
            if token.start[0] != 1 or token.type in (tokenize.ENDMARKER, tokenize.NEWLINE):
                continue
            word = token.string.lower()
            qualified = previous == "." or source[token.end[1] :].lstrip().startswith(".")
            if token.type == tokenize.NAME and not qualified:
                replacement = words.get(word)
                if (
                    condition
                    and word in ("dann", "wiederhole", "do", "then")
                    and not source[token.end[1] :].strip()
                ):
                    replacement = ""
                if replacement is not None:
                    edits.append((token.start[1], token.end[1], replacement))
            if token.string.strip():
                previous = token.string
    except (tokenize.TokenError, IndentationError):
        return source
    for start, end, replacement in reversed(edits):
        source = source[:start] + replacement + source[end:]
    return source.strip()


def counting_loop(source: str) -> str:
    try:
        parts = list(tokenize.generate_tokens(io.StringIO(source).readline))
    except tokenize.TokenError:
        return source
    boundary = next((t for t in parts if t.type == tokenize.NAME and t.string.lower() == "bis"), None)
    step = next((t for t in parts if t.type == tokenize.NAME and t.string.lower() == "schritt"), None)
    if boundary:
        first = re.fullmatch(r"\s*([^\W\d]\w*)\s*(?:←|<-|:=|=|von)\s*(.+)", source[: boundary.start[1]])
        if first:
            end = source[boundary.end[1] : step.start[1] if step else len(source)].strip()
            increment = source[step.end[1] :].strip() if step else "1"
            return f"{first[1]} in range({expression(first[2])}, ({expression(end)}) + (1 if ({expression(increment)}) > 0 else -1), {expression(increment)})"
    return re.sub(r"\s+IN\s+", " in ", expression(re.sub(r"^jedes?\s+", "", source, flags=re.I)))


def type_brackets(source: str, signature: bool) -> str:
    """Translate Liste<T> only inside annotations; defaults and literals are untouched."""
    depth = 0
    annotation = False
    base = 0
    parameter_start = 0
    previous = ""
    generic_depths = []
    edits = []
    declaration = re.match(r"\s*[^\W\d]\w*(?:\.[^\W\d]\w*)*\s*:", source)
    try:
        for token in tokenize.generate_tokens(io.StringIO(source).readline):
            value = token.string
            if token.start[0] != 1 or token.type in (
                tokenize.ENDMARKER,
                tokenize.NEWLINE,
                tokenize.INDENT,
                tokenize.DEDENT,
            ):
                continue
            if annotation and depth == base and value in (",", "=", ";", ")"):
                annotation = False
            if value == ":" and (
                (
                    signature
                    and depth == 1
                    and re.fullmatch(r"\s*\*{0,2}[^\W\d]\w*\s*", source[parameter_start : token.start[1]])
                )
                or (not signature and declaration and token.start[1] == declaration.end() - 1)
            ):
                annotation, base = True, depth
            if signature and value == "->" and depth == 0:
                annotation, base = True, 0
            if (
                value == "<"
                and annotation
                and ALIASES.get(previous.lower(), previous) in ("list", "set", "tuple", "dict")
            ):
                edits.append((token.start[1], token.end[1], "["))
                generic_depths.append(depth)
                depth += 1
            elif (
                value in (">", ">>") and len(generic_depths) >= len(value) and depth == generic_depths[-1] + 1
            ):
                edits.append((token.start[1], token.end[1], "]" * len(value)))
                for _ in value:
                    generic_depths.pop()
                    depth -= 1
            elif value in ("(", "[", "{"):
                if signature and value == "(" and depth == 0:
                    parameter_start = token.end[1]
                depth += 1
            elif value in (")", "]", "}"):
                depth -= 1
            if value == "," and signature and depth == 1:
                parameter_start = token.end[1]
            if value.strip():
                previous = value
    except (tokenize.TokenError, IndentationError):
        return source
    for start, end, replacement in reversed(edits):
        source = source[:start] + replacement + source[end:]
    return source


def comparison(source: str) -> str:
    groups: list[bool] = []
    previous = None
    edits = []
    fstrings = 0
    non_calls = {"and", "or", "not", "if", "else", "in", "is", "while"}
    try:
        for token in tokenize.generate_tokens(io.StringIO(source).readline):
            name = tokenize.tok_name[token.type]
            if name == "FSTRING_START":
                fstrings += 1
            if fstrings:
                if name == "FSTRING_END":
                    fstrings -= 1
                continue
            value = token.string
            if token.type not in (tokenize.OP, tokenize.NAME, tokenize.NUMBER, tokenize.ERRORTOKEN):
                continue
            if value.isspace():
                continue
            if value == "(":
                groups.append(
                    bool(
                        previous
                        and (
                            (previous.type == tokenize.NAME and previous.string not in non_calls)
                            or previous.string in (")", "]")
                        )
                    )
                )
            elif value in ("[", "{"):
                groups.append(False)
            elif value in (")", "]", "}"):
                if groups:
                    groups.pop()
            replacement = (
                "=="
                if value == "=" and not (groups and groups[-1])
                else {"≤": "<=", "≥": ">=", "≠": "!="}.get(value)
            )
            if replacement and token.start[0] == 1:
                edits.append((token.start[1], token.end[1], replacement))
            previous = token
    except (tokenize.TokenError, IndentationError):
        return source
    for start, end, replacement in reversed(edits):
        source = source[:start] + replacement + source[end:]
    return source


def python_text(text: str, kind: str) -> str:
    value = text.strip()
    if kind == "dowhile":
        value = re.sub(r"^(?:while|solange)\s+", "", value, flags=re.I)
    if kind == "repeat":
        value = re.sub(r"^(?:until|bis)\s+", "", value, flags=re.I)
    if kind in ("if", "while", "dowhile", "repeat"):
        return comparison(expression(value, True))
    if kind == "for":
        return counting_loop(value)
    if kind == "switch":
        return expression(value)
    if kind == "case":
        value = expression(value)
        depth = 0
        case_edits = []
        try:
            for token in tokenize.generate_tokens(io.StringIO(value).readline):
                if token.type != tokenize.OP:
                    continue
                if token.string in ("(", "[", "{"):
                    depth += 1
                if token.string in (")", "]", "}"):
                    depth -= 1
                if token.string == "," and depth == 0:
                    case_edits.append((token.start[1], token.end[1]))
        except tokenize.TokenError:
            return value
        for start, end in reversed(case_edits):
            value = value[:start] + " |" + value[end:]
        return value
    if not value or kind not in ("statement", "function"):
        return value
    if kind == "function":
        # Also accept the common typed f(x: GZ): GZ spelling in imported diagrams.
        value = re.sub(r"\)\s*:\s*(\S.*?)\s*$", r") -> \1", value)
    if kind == "statement":
        value = re.sub(r"^(?:rückgabe|rueckgabe|return)\b\s*", "return ", value, flags=re.I)
        value = re.sub(r"^abbruch\s*$", "break", value, flags=re.I)
        value = re.sub(r"^weiter\s*$", "continue", value, flags=re.I)
        output = re.match(r"^(?:ausgabe|gib\s+aus)\s+(.+)$", value, re.I)
        if output:
            value = f"print({output[1]})"
        value = re.sub(
            r"^([^\W\d]\w*(?:\s*:\s*[^=←]+)?)\s*(?:←|:=)\s*", lambda match: match[1].rstrip() + " = ", value
        )
        value = expression(value)
    value = type_brackets(value, kind == "function")
    prefix = "def " if kind == "function" else ""
    source = prefix + value + (":\n    pass" if kind == "function" else "")
    try:
        tree = ast.parse(source)
    except SyntaxError:
        # The existing export validator reports incomplete/invalid syntax with its line.
        return value
    annotations: list[ast.expr] = []
    for node in tree.body:
        if isinstance(node, ast.AnnAssign):
            annotations.append(node.annotation)
        if isinstance(node, ast.FunctionDef):
            args = [*node.args.posonlyargs, *node.args.args, *node.args.kwonlyargs]
            args += [arg for arg in (node.args.vararg, node.args.kwarg) if arg is not None]
            annotations.extend(arg.annotation for arg in args if arg.annotation is not None)
            if node.returns is not None:
                annotations.append(node.returns)
    edits: list[tuple[int, int, str]] = []

    class TypeNames(ast.NodeVisitor):
        def visit_Name(self, node: ast.Name):
            replacement = ALIASES.get(node.id.lower())
            if replacement and replacement != node.id and node.lineno == 1:
                # AST columns are UTF-8 byte offsets, not character indexes.
                encoded = source.splitlines()[0].encode()
                start = len(encoded[: node.col_offset].decode()) - len(prefix)
                end = len(encoded[: node.end_col_offset].decode()) - len(prefix)
                edits.append((start, end, replacement))

        def visit_Attribute(self, node: ast.Attribute):
            # Qualified application types are never aliases: package.GZ, GZ.Record.
            return

        def visit_Subscript(self, node: ast.Subscript):
            name = node.value.id if isinstance(node.value, ast.Name) else getattr(node.value, "attr", "")
            if name == "Literal":
                return
            self.visit(node.value)
            if name == "Annotated" and isinstance(node.slice, ast.Tuple):
                self.visit(node.slice.elts[0])
            else:
                self.visit(node.slice)

    for annotation in annotations:
        TypeNames().visit(annotation)
    for start, end, replacement in sorted(edits, reverse=True):
        value = value[:start] + replacement + value[end:]
    return value
