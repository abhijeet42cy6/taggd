"""Tests for requisition ID column resolution."""
import math

from backend.core.pos_id_column import normalize_pos_id_value, resolve_pos_id_column, resolve_req_id_from_row


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


def test_normalize_pos_id_value_preserves_hyphen_suffix():
    assert normalize_pos_id_value("31964-1") == "31964-1"
    assert normalize_pos_id_value("32143-2") == "32143-2"
    assert normalize_pos_id_value("33079-1") == "33079-1"


def test_resolve_req_id_from_row_prefers_req_id_over_position_title_column():
    row = {
        "Req ID": "31964-1",
        "Position Title": "Safety regulation engineer",
        "Candidate Name": "Sabarivasan KN",
    }
    assert resolve_req_id_from_row(row, pos_id_col_name="Position Title") == "31964-1"
    assert resolve_req_id_from_row(row, pos_id_col_name="Req ID") == "31964-1"
