import ast

import pytest

from app.conversion.parser import export_python, parse_python
from app.conversion.type_names import python_text
from app.schema import Document


@pytest.mark.parametrize(
    "source,kind,expected",
    [
        ("x: GZ", "statement", "x: int"),
        ("preis: RZ = 2.5", "statement", "preis: float = 2.5"),
        ('name: ZK = "GZ"', "statement", 'name: str = "GZ"'),
        ("bereit: WW = True", "statement", "bereit: bool = True"),
        ("werte: Liste[GZ] = []", "statement", "werte: list[int] = []"),
        ("werte: dict[ZK, Liste[GZ]] = {}", "statement", "werte: dict[str, list[int]] = {}"),
        ("größe: GZ = 3", "statement", "größe: int = 3"),
        (
            'f(x: GZ, text: ZK = "GZ", *, ok: WW = True) -> RZ',
            "function",
            'f(x: int, text: str = "GZ", *, ok: bool = True) -> float',
        ),
        ("f(x: GZ): GZ", "function", "f(x: int) -> int"),
        ("f() -> void", "function", "f() -> None"),
        ("f(x = lambda y: GZ) -> GZ", "function", "f(x = lambda y: GZ) -> int"),
        ("x: Literal[GZ] = GZ", "statement", "x: Literal[GZ] = GZ"),
        ("x: Annotated[GZ, ZK]", "statement", "x: Annotated[int, ZK]"),
        ("x: package.GZ", "statement", "x: package.GZ"),
        ("x: GZ.Record", "statement", "x: GZ.Record"),
        ('GZ = "GZ"', "statement", 'GZ = "GZ"'),
        ("x: Kunde", "statement", "x: Kunde"),
        ("x = pruefe(wert=10) and y ≤ 3", "if", "x == pruefe(wert=10) and y <= 3"),
        ("not (x = 1) and (y := 2) ≠ 0", "while", "not (x == 1) and (y := 2) != 0"),
        ('x = f"{y=}"', "if", 'x == f"{y=}"'),
    ],
)
def test_only_type_annotations_are_normalized(source, kind, expected):
    assert python_text(source, kind) == expected


def test_typed_function_and_return_roundtrip():
    doc = Document.model_validate(
        {
            "nodes": [
                {
                    "id": "function",
                    "kind": "function",
                    "text": "quadratisch(x: GZ) -> GZ",
                    "children": [{"id": "result", "kind": "statement", "text": "return x * x"}],
                }
            ]
        }
    )
    source = export_python(doc)
    assert source == "def quadratisch(x: int) -> int:\n    return x * x\n"
    imported = Document.model_validate(parse_python(source)["document"])
    assert imported.nodes[0].text == "quadratisch(x: int) -> int"
    assert ast.dump(ast.parse(export_python(imported))) == ast.dump(ast.parse(source))
