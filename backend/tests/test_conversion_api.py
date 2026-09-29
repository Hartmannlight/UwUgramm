import pytest


@pytest.mark.parametrize("character", ["ä", "漢", "🐾"])
async def test_unicode_conversion_uses_the_same_limits_in_both_directions(clients, character):
    alice, _ = clients
    source = "".join("# " + character * 950 + "\n" for _ in range(48))
    imported = await alice.post("/api/convert/from-python", json={"source": source})
    assert imported.status_code == 200, imported.text
    document = imported.json()["document"]
    assert len(document["nodes"]) == 48
    exported = await alice.post("/api/convert/to-python", json=document)
    assert exported.status_code == 200, exported.text
    assert exported.json()["source"] == source


async def test_parser_process_roundtrip(clients):
    alice, _ = clients
    response = await alice.post("/api/convert/from-python", json={"source": "x = 2\nif x:\n    print(x)\n"})
    assert response.status_code == 200, response.text
    result = await alice.post("/api/convert/to-python", json=response.json()["document"])
    assert result.status_code == 200
    assert "print(x)" in result.json()["source"]
