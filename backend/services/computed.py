"""Computed field engine.

Evaluates simple arithmetic formulas referencing other fields in an item's data.
Supports: +, -, *, /, field references, field.value (for compound unit fields), and numeric literals.
No arbitrary code execution — only safe math expressions.
"""

import ast
import operator
from typing import Any


SAFE_OPS = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
}


def _resolve_field_ref(ref: str, data: dict) -> float | None:
    """Resolve a field reference like 'price' or 'amount.value' from item data.
    
    For multi-entry (list) fields, returns the sum of numeric values.
    """
    parts = ref.split(".")
    val = data
    for part in parts:
        if isinstance(val, dict):
            val = val.get(part)
        else:
            return None
        if val is None:
            return None
    if isinstance(val, (int, float)):
        return float(val)
    if isinstance(val, list):
        total = 0.0
        for item in val:
            if isinstance(item, (int, float)):
                total += float(item)
            elif isinstance(item, dict) and "value" in item:
                v = item["value"]
                if isinstance(v, (int, float)):
                    total += float(v)
            else:
                return None
        return total
    return None


def _eval_node(node: ast.AST, data: dict) -> float | None:
    """Recursively evaluate an AST node with item data context."""
    if isinstance(node, ast.Expression):
        return _eval_node(node.body, data)

    if isinstance(node, ast.Constant):
        if isinstance(node.value, (int, float)):
            return float(node.value)
        return None

    if isinstance(node, ast.Name):
        return _resolve_field_ref(node.id, data)

    if isinstance(node, ast.Attribute):
        # Handle things like amount.value
        parts = []
        current = node
        while isinstance(current, ast.Attribute):
            parts.append(current.attr)
            current = current.value
        if isinstance(current, ast.Name):
            parts.append(current.id)
        parts.reverse()
        return _resolve_field_ref(".".join(parts), data)

    if isinstance(node, ast.BinOp):
        op_func = SAFE_OPS.get(type(node.op))
        if not op_func:
            return None
        left = _eval_node(node.left, data)
        right = _eval_node(node.right, data)
        if left is None or right is None:
            return None
        if isinstance(node.op, ast.Div) and right == 0:
            return None
        return op_func(left, right)

    if isinstance(node, ast.UnaryOp) and isinstance(node.op, ast.USub):
        val = _eval_node(node.operand, data)
        return -val if val is not None else None

    return None


def evaluate_formula(formula: str, data: dict) -> float | None:
    """Safely evaluate a formula string against item data.

    Examples:
        evaluate_formula("calories_per_serving * servings", {"calories_per_serving": 150, "servings": 16})
        -> 2400.0

        evaluate_formula("amount.value * count", {"amount": {"value": 64, "unit": "fl oz"}, "count": 2})
        -> 128.0
    """
    try:
        tree = ast.parse(formula, mode="eval")
    except SyntaxError:
        return None
    return _eval_node(tree, data)


def recompute_item(data: dict, schema_def: dict) -> dict:
    """Recompute all computed fields in an item's data based on schema definition.

    Returns updated data dict with computed values filled in.
    """
    updated = dict(data)
    sections = schema_def.get("sections", {})

    # Collect all computed fields
    computed_fields = []
    for section_fields in sections.values():
        for field_name, field_def in section_fields.items():
            if isinstance(field_def, dict) and field_def.get("type") == "computed":
                computed_fields.append((field_name, field_def))

    # Evaluate computed fields (may need multiple passes for chained dependencies)
    max_passes = 5
    for _ in range(max_passes):
        changed = False
        for field_name, field_def in computed_fields:
            formula = field_def.get("formula", "")
            result = evaluate_formula(formula, updated)
            if result is None:
                continue

            result_type = field_def.get("result_type", "float")
            if result_type == "unit":
                unit_from = field_def.get("unit_from", "")
                source_unit_val = updated.get(unit_from)
                unit = ""
                if isinstance(source_unit_val, dict):
                    unit = source_unit_val.get("unit", "")
                new_val = {"value": round(result, 6), "unit": unit}
                if updated.get(field_name) != new_val:
                    updated[field_name] = new_val
                    changed = True
            else:
                rounded = round(result, 6)
                if updated.get(field_name) != rounded:
                    updated[field_name] = rounded
                    changed = True

        if not changed:
            break

    return updated
