# Revenue logic sandbox (RestrictedPython)

This document describes the **security hardening** applied to AI-generated and user-persisted **revenue calculation** code—replacing unbounded `exec()` in the API process with **RestrictedPython** and a narrow import allow-list.

**Related:** [`docs/ENTERPRISE_SECURITY_ANALYSIS_AND_ROADMAP.md`](ENTERPRISE_SECURITY_ANALYSIS_AND_ROADMAP.md) (RCE risk and roadmap).

---

## Problem

Previously, the ingestion pipeline executed LLM-generated Python with:

```python
exec(logic_code, globals(), loc)
calc_func = loc["calculate"]
```

That granted **full interpreter power** to untrusted strings (model output, or values already stored in `projects.revenue_logic_code`). A malicious or prompt-injected script could access the environment, filesystem, or network in the same process as the API.

---

## Solution

1. **Compile** the source string with **`compile_restricted_exec`** (RestrictedPython). The AST is transformed so dangerous constructs are rejected or wrapped.

2. **Execute** the resulting bytecode only with RestrictedPython’s required globals:
   - Merged **safe / limited / utility** builtins (as documented in RestrictedPython).
   - **`_getiter_`**, **`_getitem_`**, **`_unpack_sequence_`**, **`_inplacevar_`** guards.

3. **Imports** are not left as default CPython `__import__`. A small **allow-list** is enforced:
   - Allowed: **`math`**, **`re`**, **`datetime`**.
   - Any other `import` raises **`ImportError`** at runtime.

4. The public API is **`load_calculate_from_source(source: str) -> Callable[[dict], dict]`** in  
   [`backend/core/revenue_logic_loader.py`](../backend/core/revenue_logic_loader.py).  
   On failure, raise **`RevenueLogicCompileError`** (subclass of `ValueError`) with a message suitable for HTTP **400** responses.

**Note:** The loader still uses Python’s `exec()` **only on the restricted bytecode object** returned by RestrictedPython—not on raw user source with full `globals()`. That matches standard RestrictedPython usage.

---

## Code touchpoints

| Location | Change |
|----------|--------|
| [`backend/core/revenue_logic_loader.py`](../backend/core/revenue_logic_loader.py) | New module: compile, guarded env, `load_calculate_from_source` |
| [`backend/main.py`](../backend/main.py) | Express upload, Pro confirm, and project **recalculate** now load logic via the sandbox helper (no direct `exec` of raw logic strings) |
| [`backend/agents/logic_generator.py`](../backend/agents/logic_generator.py) | Prompt constraint: use only `math` / `re` / `datetime` for imports; no `os`, subprocess, or file I/O |
| [`requirements.txt`](../requirements.txt) | **`RestrictedPython>=8.0,<9.0`** |
| [`test_e2e.py`](../test_e2e.py) | Manual E2E script uses `load_calculate_from_source` |
| [`backend/tests/test_revenue_logic_loader.py`](../backend/tests/test_revenue_logic_loader.py) | Pytest: happy path, forbidden import, allowed `math` import |

---

## Compatibility

- **Typical** generated logic (`calculate(row)` using dict access, strings, floats, conditionals) continues to work.
- **Legacy** scripts that relied on **forbidden** behavior (e.g. `import os`, `open(...)`, `pandas`, network) will **fail at compile or first import** with a clear error. Operators should **regenerate** revenue logic for that project (existing UI flows).

Recalculate and ingest paths return **HTTP 400** with a readable error when logic cannot be compiled, instead of executing arbitrary code.

---

## Verification

```bash
pip install -r requirements.txt
python3 -m pytest backend/tests/test_revenue_logic_loader.py -q
python3 -m py_compile backend/core/revenue_logic_loader.py backend/main.py
```

---

## Future hardening (optional)

RestrictedPython reduces attack surface inside the **same process**. For the strongest isolation, a follow-on step is running the same contract (`calculate(row)`) in a **separate process or container** with OS-level limits (no network, read-only filesystem, CPU/memory caps). That would be additive and does not replace the need for restricted compilation when code runs in-process.

---

*Last updated to reflect the RestrictedPython-based revenue logic sandbox.*
