"""JSON schema adjustments for providers that enforce structured outputs."""

from __future__ import annotations

import copy
from typing import Any


def closed_schema(schema: dict[str, Any]) -> dict[str, Any]:
    """Copy of a Pydantic JSON schema where every object forbids extra properties.

    Structured output modes require ``additionalProperties: false`` on objects; the
    response is still validated by Pydantic afterwards.
    """
    result = copy.deepcopy(schema)

    def visit(node: Any) -> None:
        if isinstance(node, dict):
            if node.get("type") == "object" or "properties" in node:
                node.setdefault("additionalProperties", False)
            for value in node.values():
                visit(value)
        elif isinstance(node, list):
            for item in node:
                visit(item)

    visit(result)
    return result
