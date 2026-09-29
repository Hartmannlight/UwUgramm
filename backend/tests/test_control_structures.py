import ast

import pytest
from pydantic import ValidationError

from app.conversion.parser import export_python, parse_python
from app.conversion.type_names import python_text
from app.schema import Document, Node


def node(kind, text="", children=None, otherwise=None):
    from uuid import uuid4

    return Node(id=uuid4().hex, kind=kind, text=text, children=children or [], otherwise=otherwise or [])


@pytest.mark.parametrize("kind,condition", [("dowhile", "n < 3"), ("repeat", "n >= 3")])
def test_post_loop_continues_test_the_footer_and_roundtrip(kind, condition):
    loop = node(
        kind, condition, [node("statement", "n += 1"), node("if", "n < 10", [node("statement", "weiter")])]
    )
    doc = Document(nodes=[node("statement", "n = 0"), loop])
    source = export_python(doc)
    # Only fixed test fixtures are executed; the application never executes source.
    namespace = {}
    exec(source, namespace)
    assert namespace["n"] == 3
    restored = Document.model_validate(parse_python(source)["document"])
    assert restored.nodes[1].kind == kind
    assert restored.nodes[1].children[1].children[0].text == "continue"
    assert ast.dump(ast.parse(export_python(restored))) == ast.dump(ast.parse(source))


def test_plain_while_with_unguarded_continue_keeps_its_semantics():
    source = "while True:\n    if x:\n        continue\n    if not y:\n        break\n"
    assert parse_python(source)["document"]["nodes"][0]["kind"] == "while"


def test_match_patterns_guards_and_default_roundtrip():
    source = "match wert:\n    case 1 | 2:\n        x = 1\n    case [x, y] if x > 0:\n        x += y\n    case _:\n        x = 0\n"
    doc = Document.model_validate(parse_python(source)["document"])
    assert doc.nodes[0].kind == "switch"
    assert [c.kind for c in doc.nodes[0].children] == ["case", "case"]
    assert ast.dump(ast.parse(export_python(doc))) == ast.dump(ast.parse(source))


def test_case_placement_is_validated():
    with pytest.raises(ValidationError):
        Document(nodes=[node("case", "1")])
    with pytest.raises(ValidationError):
        Document(nodes=[node("switch", "x", [node("statement", "x=1")])])


@pytest.mark.parametrize(
    "text,kind,expected",
    [
        ("x: FKZ = 1.0", "statement", "x: float = 1.0"),
        ("x: double", "statement", "x: float"),
        ("x: Liste<FKZ> = []", "statement", "x: list[float] = []"),
        (
            "f(xs: Liste<Liste<GZ>>, x: FKZ = 1) -> Liste<Text>",
            "function",
            "f(xs: list[list[int]], x: float = 1) -> list[str]",
        ),
        ('x = "wahr UND FKZ < GZ>"', "statement", 'x = "wahr UND FKZ < GZ>"'),
        ("x gleich 10 UND nicht fertig DANN", "if", "x == 10 and not fertig"),
        ("x: Boolean ← wahr", "statement", "x: bool = True"),
        ("RÜCKGABE wahr", "statement", "return True"),
        ('AUSGABE "FKZ"', "statement", 'print("FKZ")'),
        ("1, 2", "case", "1 | 2"),
        ("[x, y]", "case", "[x, y]"),
        ("i ← 1 BIS 5 SCHRITT 2", "for", "i in range(1, (5) + (1 if (2) > 0 else -1), 2)"),
    ],
)
def test_exam_spellings(text, kind, expected):
    assert python_text(text, kind) == expected
