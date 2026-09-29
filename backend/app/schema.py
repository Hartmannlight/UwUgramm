import json
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


class Node(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str = Field(min_length=1, max_length=80, pattern=r"^[a-zA-Z0-9_-]+$")
    kind: Literal[
        "statement", "if", "while", "for", "function", "comment", "switch", "case", "dowhile", "repeat"
    ]
    text: str = Field(max_length=2000)
    children: list["Node"] = Field(default_factory=list, max_length=500)
    otherwise: list["Node"] = Field(default_factory=list, max_length=500)


class Document(BaseModel):
    model_config = ConfigDict(extra="forbid")
    version: Literal[1] = 1
    nodes: list[Node] = Field(default_factory=list, max_length=500)

    @model_validator(mode="after")
    def check_tree(self):
        seen: set[str] = set()

        def visit(nodes: list[Node], depth: int, parent: str | None = None):
            if depth > 20:
                raise ValueError("Maximal 20 Verschachtelungen erlaubt.")
            for node in nodes:
                if node.id in seen or len(seen) >= 500:
                    raise ValueError("Knoten-IDs müssen eindeutig sein; maximal 500 Blöcke.")
                seen.add(node.id)
                if node.kind in ("statement", "comment") and (node.children or node.otherwise):
                    raise ValueError("Anweisungen und Kommentare haben keine Unterblöcke.")
                if node.kind not in ("if", "switch") and node.otherwise:
                    raise ValueError("Nur Bedingungen und Mehrfachauswahlen haben einen Sonst-Zweig.")
                if (node.kind == "case") != (parent == "switch"):
                    raise ValueError("Fälle müssen direkt in einer Mehrfachauswahl stehen.")
                visit(node.children, depth + 1, node.kind)
                visit(node.otherwise, depth + 1)

        visit(self.nodes, 0)
        if len(json.dumps(self.model_dump(), ensure_ascii=False).encode("utf-8")) > 200_000:
            raise ValueError("Das Diagramm darf maximal 200 KB groß sein.")
        return self


class ProjectWrite(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: str = Field(min_length=1, max_length=100)
    document: Document
    revision: int = Field(default=0, ge=0)
    folder_id: UUID | None = None


class FolderWrite(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    name: str = Field(min_length=1, max_length=100)


class FolderCreate(FolderWrite):
    id: UUID


class PythonSource(BaseModel):
    source: str = Field(max_length=50_000)


class ShareCode(BaseModel):
    code: str = Field(min_length=8, max_length=9, pattern=r"^[A-Za-z2-9-]+$")
