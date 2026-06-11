"""Unit tests for restricted revenue logic loader."""
from __future__ import annotations

import pytest

from backend.core.revenue_logic_loader import RevenueLogicCompileError, load_calculate_from_source


def test_simple_calculate_returns_dict():
    src = """
def calculate(row):
    return {
        "revenue": 100.0,
        "opening_fee": 0.0,
        "closing_fee": 0.0,
        "status": "ok",
    }
"""
    fn = load_calculate_from_source(src)
    out = fn({"x": 1})
    assert out["revenue"] == 100.0


def test_calculate_with_type_annotations_llm_style():
    """LogicGeneratorAgent prompts for ``row: dict`` / ``-> dict``; RestrictedPython must expose ``dict``."""
    src = """
def calculate(row: dict) -> dict:
    return {
        "revenue": 1.0,
        "opening_fee": 0.0,
        "closing_fee": 0.0,
        "status": "ok",
    }
"""
    fn = load_calculate_from_source(src)
    assert fn({})["revenue"] == 1.0


def test_forbidden_import_raises():
    src = """
import os
def calculate(row):
    return {"revenue": 0.0, "opening_fee": 0.0, "closing_fee": 0.0, "status": "x"}
"""
    with pytest.raises(RevenueLogicCompileError):
        load_calculate_from_source(src)


def test_allowed_math_import():
    src = """
import math
def calculate(row):
    return {"revenue": float(math.ceil(2.1)), "opening_fee": 0.0, "closing_fee": 0.0, "status": "ok"}
"""
    fn = load_calculate_from_source(src)
    assert fn({})["revenue"] == 3.0


def test_calculate_with_any_builtin_llm_style():
    """Pinned project logic (Birla/Ambuja) branches on status via any(...)."""
    src = """
def calculate(row: dict) -> dict:
    status_str = str(row.get("Status") or "").strip().lower()
    if any(x in status_str for x in ("cancel", "void")):
        return {"revenue": 0.0, "opening_fee": 0.0, "closing_fee": 0.0, "status": "Cancelled"}
    if any(x in status_str for x in ("documentation", "offer")):
        return {"revenue": 0.0, "opening_fee": 0.0, "closing_fee": 50000.0, "status": "Offer Stage"}
    return {"revenue": 0.0, "opening_fee": 25000.0, "closing_fee": 0.0, "status": "In Progress"}
"""
    fn = load_calculate_from_source(src)
    out = fn({"Status": "Documentation"})
    assert out["closing_fee"] == 50000.0
    assert out["status"] == "Offer Stage"
    assert fn({"Status": "Cancelled"})["status"] == "Cancelled"
