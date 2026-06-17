"""Tests for config-first tracker_config helpers."""
from __future__ import annotations

from backend.core.revenue_logic_loader import load_calculate_from_source
from backend.core.tracker_config import (
    build_mapping_from_aliases,
    merge_status_vocabulary_into_mapping,
    merge_tracker_config,
    synthesize_logic_from_fee_model,
)


def test_build_mapping_from_aliases_uses_headers():
    aliases = {"req_id": "TARA ID", "status": "Current Stage"}
    headers = ["TARA ID", "Current Stage", "Other"]
    payload = build_mapping_from_aliases(aliases, headers, None)
    assert payload["universal"]["req_id"] == "TARA ID"
    assert payload["universal"]["status"] == "Current Stage"


def test_merge_status_vocabulary_overrides_lexicon():
    base = {
        "version": 3,
        "universal": {"status": "Current Stage"},
        "record_fields": {},
        "status_lexicon": {
            "primary_column": "Current Stage",
            "value_map": {
                "wip": {"global_status": "PIPELINE", "canonical_status": "Open", "source": "rule"},
            },
        },
    }
    out = merge_status_vocabulary_into_mapping(base, {"WIP": "Open", "TBO": "Offered"})
    vm = out["status_lexicon"]["value_map"]
    assert vm["wip"]["canonical_status"] == "Open"
    assert vm["wip"]["source"] == "config"
    assert vm["tbo"]["canonical_status"] == "Offered"


def test_synthesize_flat_fee_logic_compiles():
    code = synthesize_logic_from_fee_model({"type": "flat_fee", "flat_fee_per_joiner": 19800})
    fn = load_calculate_from_source(code)
    out = fn({"Current Status": "Joined"})
    assert out["closing_fee"] == 19800


def test_synthesize_percentage_logic_compiles():
    code = synthesize_logic_from_fee_model(
        {"type": "percentage", "closing_fee_pct": 0.05, "opening_fee_pct": 0.01, "ctc_unit": "lakhs"}
    )
    fn = load_calculate_from_source(code)
    out = fn({"Current Status": "Joined", "Offered CTC (Lakhs)": 10})
    assert out["closing_fee"] == 50000.0


def test_merge_tracker_config_deep_merges_dicts():
    merged = merge_tracker_config(
        {"status_vocabulary": {"WIP": "Open"}, "ctc_unit": "inr"},
        {"status_vocabulary": {"TBO": "Offered"}},
    )
    assert merged["status_vocabulary"]["WIP"] == "Open"
    assert merged["status_vocabulary"]["TBO"] == "Offered"
