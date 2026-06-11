"""Tests for requisition ID column resolution."""
import math

from backend.core.pos_id_column import normalize_pos_id_value, resolve_pos_id_column


def test_resolve_ambuja_prefers_req_id_over_requirment_type():
    headers = [
        "Sr. No.",
        "Requirment Type",
        "Position Name",
        "Req ID",
        "Candidate Name",
    ]
    assert resolve_pos_id_column(headers) == "Req ID"


def test_resolve_birla_abg_req_id():
    headers = ["ABG Req ID", "Role", "Current Status"]
    assert resolve_pos_id_column(headers) == "ABG Req ID"


def test_resolve_excludes_req_date():
    headers = ["Date of req received", "Req ID"]
    assert resolve_pos_id_column(headers) == "Req ID"


def test_normalize_pos_id_value_strips_nan_and_float_suffix():
    assert normalize_pos_id_value(None) == ""
    assert normalize_pos_id_value(float("nan")) == ""
    assert normalize_pos_id_value("nan") == ""
    assert normalize_pos_id_value(50671.0) == "50671"
    assert normalize_pos_id_value(" 41124.0 ") == "41124"
