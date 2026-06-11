"""Tests for requisition status lexicon (column detection, value mapping, revenue merge)."""

from backend.core.status_lexicon import (
    BLANK_KEY,
    build_value_map,
    merge_global_status_with_revenue,
    normalize_status_key,
    resolve_row_status,
    _rule_map_key,
)


def test_normalize_status_key_blank():
    assert normalize_status_key(None) == BLANK_KEY
    assert normalize_status_key("  ") == BLANK_KEY
    assert normalize_status_key("N/A") == BLANK_KEY


def test_normalize_status_key_trim():
    assert normalize_status_key("  Joined ") == "joined"


def test_rule_map_joined_and_open():
    assert _rule_map_key("joined")["global_status"] == "CLOSED"
    assert _rule_map_key("open")["global_status"] == "ACTIVE"
    assert _rule_map_key("cancelled")["global_status"] == "ON HOLD"


def test_build_value_map_covers_all_keys():
    inventory = {
        "joined": {"count": 10, "raw_examples": ["Joined"]},
        "wip": {"count": 5, "raw_examples": ["WIP"]},
        BLANK_KEY: {"count": 2, "raw_examples": [""]},
    }
    vm = build_value_map(inventory)
    assert set(vm.keys()) == set(inventory.keys())
    assert vm["joined"]["global_status"] == "CLOSED"


def test_merge_global_status_closing_fee_wins():
    assert merge_global_status_with_revenue("ACTIVE", {"closing_fee": 50000}) == "CLOSED"
    assert merge_global_status_with_revenue("ACTIVE", {"closing_fee": 0}) == "ACTIVE"


def test_resolve_row_status_from_lexicon():
    lexicon = {
        "primary_column": "Final Status",
        "candidate_status_column": "Final Status",
        "mandate_status_column": "Final Status",
        "row_selection_rule": "candidate_if_named_else_mandate",
        "value_map": {
            "sourcing": {"global_status": "PIPELINE", "canonical_status": "Screening"},
        },
    }
    raw, canonical, gs = resolve_row_status(
        {"Final Status": "Sourcing"},
        lexicon,
        candidate_name="Jane",
    )
    assert raw == "Sourcing"
    assert canonical == "Screening"
    assert gs == "PIPELINE"
