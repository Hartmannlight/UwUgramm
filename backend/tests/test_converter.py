import ast

import pytest
from pydantic import ValidationError

from app.conversion.parser import ConversionError, export_python, parse_python
from app.schema import Document


@pytest.mark.parametrize(
    "source",
    [
        'zahl = int(input("Zahl: "))\nif zahl % 2 == 0:\n    print("gerade")\nelse:\n    print("ungerade")\n',
        "for i in range(10):\n    if i > 4:\n        break\n    else:\n        continue\n",
        "while True:\n    print(1)\n    break\n",
        "def f(a: int, b=2) -> int:\n    return a + b\n",
        "if x:\n    a = 1\nelif y:\n    a = 2\nelse:\n    a = 3\n",
        "import math\nx = [i * 2 for i in range(3)]\nassert len(x) == 3\n",
    ],
)
def test_roundtrip_preserves_ast(source):
    document = Document.model_validate(parse_python(source)["document"])
    generated = export_python(document)
    assert ast.dump(ast.parse(generated)) == ast.dump(ast.parse(source))


@pytest.mark.parametrize(
    "source,kind",
    [
        ("try:\n    pass\nexcept:\n    pass", "Try"),
        ("class X:\n    pass", "ClassDef"),
        ('with open("a") as f:\n    pass', "With"),
        ("async def f():\n    pass", "AsyncFunctionDef"),
        ("for i in []:\n    pass\nelse:\n    pass", "else"),
        ("@decorator\ndef f():\n    pass", "Dekoratoren"),
    ],
)
def test_unsupported_constructs_are_explicit(source, kind):
    with pytest.raises(ConversionError, match=kind) as error:
        parse_python(source)
    assert error.value.line is not None


def test_comments_and_warning():
    result = parse_python("# Hallo\nx = 1 # inline\n# Ende\n")
    assert [n["kind"] for n in result["document"]["nodes"]] == ["comment", "statement", "comment"]
    assert result["warnings"]


def test_empty_body_gets_pass():
    doc = Document.model_validate({"nodes": [{"id": "x", "kind": "if", "text": "True"}]})
    assert export_python(doc) == "if True:\n    pass\n"


def test_blank_fields_do_not_accumulate_pass():
    doc = Document.model_validate(
        parse_python("if x:\n    pass\n    x = 1\n    pass\nelse:\n    pass\n")["document"]
    )
    assert export_python(doc) == "if x:\n    x = 1\n"
    doc.nodes[0].children[0].text = "x = 2"
    assert "pass" not in export_python(doc)


def test_empty_module_and_whitespace_fields_export_empty():
    assert export_python(Document()) == ""
    doc = Document.model_validate({"nodes": [{"id": "empty", "kind": "statement", "text": "  "}]})
    assert export_python(doc) == ""


def test_never_runs_python(tmp_path):
    target = tmp_path / "must-not-exist"
    code = f'open({str(target)!r}, "w").write("unsafe")'
    export_python(Document.model_validate(parse_python(code)["document"]))
    assert not target.exists()


def test_invalid_syntax_is_line_specific():
    with pytest.raises(ConversionError) as error:
        parse_python("if :")
    assert error.value.line == 1


def test_context_is_validated():
    with pytest.raises(ConversionError):
        export_python(Document.model_validate({"nodes": [{"id": "x", "kind": "statement", "text": "break"}]}))


def test_statement_cannot_hide_control_structure():
    with pytest.raises(ConversionError):
        export_python(
            Document.model_validate({"nodes": [{"id": "x", "kind": "statement", "text": "if True: pass"}]})
        )


def test_duplicate_ids_rejected():
    with pytest.raises(ValidationError):
        Document.model_validate({"nodes": [{"id": "x", "kind": "statement", "text": "pass"}] * 2})


def test_illegal_children_rejected():
    with pytest.raises(ValidationError):
        Document.model_validate(
            {
                "nodes": [
                    {
                        "id": "x",
                        "kind": "statement",
                        "text": "pass",
                        "children": [{"id": "y", "kind": "statement", "text": "pass"}],
                    }
                ]
            }
        )
