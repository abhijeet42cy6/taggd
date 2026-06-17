"""Tests for upload data-integrity helpers (processor + tracker_config)."""
from backend.core.processor import (
    ProcessorReport,
    _normalize_offered_ctc,
    _finalize_source_joiner_type,
)
from backend.core.tracker_config import merge_tracker_config, validate_row_against_tracker_config


class _FakeRecord:
    source_joiner_type = None


def test_normalize_offered_ctc_lakhs_heuristic():
    assert _normalize_offered_ctc(12.5) == 1_250_000.0
    assert _normalize_offered_ctc(12.5, ctc_unit="inr") == 12.5
    assert _normalize_offered_ctc(1_500_000) == 1_500_000.0


def test_merge_tracker_config_preserves_and_patches():
    merged = merge_tracker_config(
        {"valid_bands": ["L1"], "ctc_unit": "lakhs"},
        {"valid_departments": ["Finance"], "ctc_unit": "inr"},
    )
    assert merged["valid_bands"] == ["L1"]
    assert merged["valid_departments"] == ["Finance"]
    assert merged["ctc_unit"] == "inr"


def test_validate_row_flags_invalid_department():
    warnings, errors = validate_row_against_tracker_config(
        {"department": "Unknown Dept"},
        {"Department": "Unknown Dept"},
        {},
        {"valid_departments": ["Finance", "HR"]},
        excel_row=5,
    )
    assert not errors
    assert len(warnings) == 1
    assert warnings[0]["field"] == "Department"


def test_validate_row_required_field_error():
    warnings, errors = validate_row_against_tracker_config(
        {"joining_date": None},
        {},
        {},
        {"required_fields": ["joining_date"]},
        excel_row=3,
    )
    assert not warnings
    assert len(errors) == 1
    assert errors[0]["field"] == "joining_date"


def test_finalize_source_joiner_type_normalizes_and_warns():
    report = ProcessorReport()
    record = _FakeRecord()
    _finalize_source_joiner_type(
        record,
        {},
        {"Source Joiner Type": "ER"},
        {"source_joiner_type": "Source Joiner Type"},
        report,
        excel_pos=2,
    )
    assert record.source_joiner_type == "nontaggd_employee_referral"
    assert any(w.get("resolved") == "nontaggd_employee_referral" for w in report.warnings)


def test_processor_report_to_dict():
    report = ProcessorReport(rows_total=10, rows_valid=8, rows_skipped=2)
    report.skipped_rows.append({"row": 5, "reason": "empty_identity", "issue": "Missing identity"})
    report.valid_rows.append({"row": 4, "req_id": "REQ-001"})
    d = report.to_dict()
    assert d["rows_total"] == 10
    assert d["rows_valid"] == 8
    assert d["rows_skipped"] == 2
    assert len(d["skipped_rows"]) == 1
    assert len(d["valid_rows"]) == 1
