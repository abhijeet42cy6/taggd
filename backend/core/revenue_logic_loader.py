"""
Load AI-generated revenue `calculate(row)` functions without full-Python `exec` in the API process.

Uses RestrictedPython to compile user/LLM-supplied logic: no raw ``open``, ``__class__`` tricks,
or unrestricted imports. Only a small allow-list of stdlib modules may be imported (``math``,
``re``, ``datetime``) via a guarded ``__import__``.

Legacy logic already stored in ``projects.revenue_logic_code`` should continue to work as long
as it uses common spreadsheet-style Python (dict/string/float operations). If a historic script
relied on forbidden constructs, compilation fails with a clear error (regenerate logic in the UI).
"""

from __future__ import annotations

import builtins
import importlib
from typing import Any, Callable, Dict, Final, FrozenSet

from RestrictedPython import compile_restricted_exec
from RestrictedPython.Eval import default_guarded_getitem, default_guarded_getiter
from RestrictedPython.Guards import guarded_iter_unpack_sequence
from RestrictedPython.Guards import safe_builtins
from RestrictedPython.Limits import limited_builtins
from RestrictedPython.Utilities import utility_builtins


ALLOWED_IMPORTS: Final[FrozenSet[str]] = frozenset({"math", "re", "datetime"})

# RestrictedPython's merged builtins omit plain ``dict`` / ``list`` / etc. AI-generated
# ``def calculate(row: dict) -> dict:`` still evaluates those names at function definition
# time — without them, exec raises NameError. Expose only immutable / type constructors.
_ANNOTATION_AND_CORE_TYPES: Final[tuple[str, ...]] = (
    "dict",
    "list",
    "tuple",
    "set",
    "frozenset",
    "str",
    "int",
    "float",
    "bool",
    "type",
    "object",
    "bytes",
)

# LLM-generated revenue logic commonly uses these; RestrictedPython omits several by default.
_EXTRA_SAFE_BUILTINS: Final[tuple[str, ...]] = (
    "any",
    "all",
    "min",
    "max",
    "sum",
    "abs",
    "round",
    "len",
    "enumerate",
    "zip",
    "range",
    "sorted",
    "isinstance",
)


class RevenueLogicCompileError(ValueError):
    """Raised when stored logic cannot be compiled under the restricted policy."""


def _safe_import(name: str, globals=None, locals=None, fromlist=(), level=0):
    if name not in ALLOWED_IMPORTS:
        raise ImportError(
            f"import {name!r} is not allowed in revenue logic "
            f"(allowed: {', '.join(sorted(ALLOWED_IMPORTS))}).",
        )
    return importlib.import_module(name)


def _restricted_builtins() -> dict[str, Any]:
    merged: dict[str, Any] = {}
    merged.update(safe_builtins)
    merged.update(limited_builtins)
    merged.update(utility_builtins)
    merged["__import__"] = _safe_import
    for _n in _ANNOTATION_AND_CORE_TYPES:
        merged[_n] = getattr(builtins, _n)
    for _n in _EXTRA_SAFE_BUILTINS:
        if _n not in merged:
            merged[_n] = getattr(builtins, _n)
    return merged


def _restricted_exec_globals() -> dict[str, Any]:
    """Globals dict required by RestrictedPython-transformed bytecode."""
    return {
        "__builtins__": _restricted_builtins(),
        "_getiter_": default_guarded_getiter,
        "_getitem_": default_guarded_getitem,
        "_unpack_sequence_": guarded_iter_unpack_sequence,
        "_inplacevar_": (lambda op, x, y: op(x, y)),
    }


def load_calculate_from_source(source: str) -> Callable[[dict], dict]:
    """
    Compile ``source`` (a string defining ``def calculate(row): ...``) and return ``calculate``.

    The callable accepts one dict (Excel row) and must return a dict (revenue / fees / status).
    """
    if not (source or "").strip():
        raise RevenueLogicCompileError("Empty revenue logic source.")

    result = compile_restricted_exec(source, filename="<revenue_logic>")
    if result.errors:
        raise RevenueLogicCompileError(
            "RestrictedPython compile failed:\n" + "\n".join(result.errors),
        )
    if result.code is None:
        raise RevenueLogicCompileError("RestrictedPython produced no bytecode.")

    loc: dict[str, Any] = {}
    try:
        exec(result.code, _restricted_exec_globals(), loc)
    except Exception as e:
        raise RevenueLogicCompileError(f"Could not execute compiled revenue logic: {e}") from e

    calc = loc.get("calculate")
    if calc is None or not callable(calc):
        raise RevenueLogicCompileError("Revenue logic must define a callable 'calculate(row)'.")

    def _wrapped(row: dict) -> dict:
        out = calc(row)
        if not isinstance(out, dict):
            raise TypeError(f"calculate() must return dict, got {type(out).__name__}")
        return out

    return _wrapped
