"""Client portal read guard — requisitions stats must not require portfolio module."""

from backend.auth.client_vertical_read_guard import (
    _required_vertical_for_path,
    _vertical_keys_for_path,
)


def test_requisition_stats_use_requisitions_vertical():
    assert _required_vertical_for_path("/stats/requisitions/kpis") == "requisitions"
    assert _required_vertical_for_path("/stats/requisitions/departments") == "requisitions"


def test_global_monitor_accepts_requisitions_or_portfolio():
    keys = _vertical_keys_for_path("/stats/global/monitor")
    assert keys is not None
    assert "portfolio" in keys
    assert "requisitions" in keys
    assert "executive_dashboard" in keys


def test_records_accepts_candidates_fallback():
    keys = _vertical_keys_for_path("/records/all")
    assert keys is not None
    assert "requisitions" in keys
    assert "candidates" in keys
