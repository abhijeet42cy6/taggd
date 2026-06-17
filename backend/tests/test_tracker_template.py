"""Tests for production tracker template loader."""
from backend.core.tracker_template import generate_project_tracker_bytes, _masters_dir


def test_masters_dir_exists_in_repo():
    path = _masters_dir()
    assert path.is_dir()
    assert (path / "generate_taggd_tracker_template.py").is_file()


def test_generate_project_tracker_bytes():
    data = generate_project_tracker_bytes({"valid_bands": ["M3"]})
    assert isinstance(data, bytes)
    assert len(data) > 5000
    assert data[:2] == b"PK"
