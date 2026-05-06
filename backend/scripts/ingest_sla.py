import logging
import os
import sys
from collections import Counter
from typing import Any, Optional

import pandas as pd
from sqlalchemy.orm import Session

# Add project root to path so we can import from backend
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from backend.core.sla_period import canonical_month_label, parse_sla_score_column_name
from backend.core.sla_project_resolve import resolve_project_for_sla
from backend.db.database import (
    MetricDefinition,
    Project,
    SLAPerformance,
    SessionLocal,
    backfill_sla_period_starts,
    ensure_project_client,
    init_db,
)

logger = logging.getLogger(__name__)


def _sla_score_data_columns(columns: list[str]) -> list[str]:
    """
    Columns that hold period scores + pair with the next column for MET/RAG.

    Excludes catalog headers that contain the word \"Score\" but are not monthly
    snapshots (e.g. \"Metrics to be picked of BE Score (...)\" in Raw Data SLA Basefile).
    """
    out: list[str] = []
    for c in columns:
        s = str(c).strip()
        if "Score" not in s:
            continue
        low = s.lower()
        if "metrics to be picked" in low:
            continue
        out.append(c)
    return out


def _metric_group_column_name(columns: list[str]) -> Optional[str]:
    for c in columns:
        sc = str(c).strip()
        if "Metrics to be picked" in sc and "BE Score" in sc:
            return sc
    return None


def _xstr(row: pd.Series, key: str) -> str:
    v = row.get(key)
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return ""
    s = str(v).strip()
    if not s or s.lower() in ("nan", "none", "-"):
        return ""
    return s


def ingest_sla(file_path: str, db: Optional[Session] = None) -> Optional[dict[str, Any]]:
    """
    Ingest the SLA master \"Base File\" sheet into metric_definitions + sla_performances.

    Projects are resolved with case/SBU/fuzzy matching to existing rows so SLA data
    attaches to the same projects as directory / finance (charge-code clients).
    """
    logs: list[str] = []

    def log_line(msg: str, level: str = "info") -> None:
        logs.append(msg)
        log_fn = getattr(logger, level, logger.info)
        log_fn(msg)

    log_line(f"SLA ingest start — file={os.path.basename(file_path)}")

    if not os.path.exists(file_path):
        log_line(f"Error: file not found at {file_path}", "error")
        return {
            "ok": False,
            "file": os.path.basename(file_path),
            "error": f"File not found at {file_path}",
            "logs": logs,
            "rows_processed": 0,
            "performance_cells_written": 0,
            "score_columns": [],
        }

    init_db()

    external_session = db is not None
    if not external_session:
        db = SessionLocal()

    source_basename = os.path.basename(file_path)

    result: dict[str, Any] = {
        "ok": False,
        "file": source_basename,
        "rows_processed": 0,
        "rows_skipped_header": 0,
        "rows_skipped_empty_metric": 0,
        "projects_created": 0,
        "metrics_cataloged": 0,
        "performance_cells_written": 0,
        "match_reasons": {},
        "logs": logs,
        "score_columns": [],
    }

    try:
        bf = backfill_sla_period_starts(db)
        if bf:
            log_line(f"Backfill: aligned {bf} legacy SLA performance rows to calendar months.")

        try:
            df = pd.read_excel(file_path, sheet_name="Base File", header=0)
        except ValueError as e:
            xl = pd.ExcelFile(file_path)
            sheets = ", ".join(xl.sheet_names[:20])
            raise ValueError(
                "Worksheet 'Base File' not found. Open the SLA master in Excel and ensure a sheet is named "
                f"exactly 'Base File'. Sheets in this file: {sheets}"
            ) from e

        df.columns = [str(c).strip() for c in df.columns]
        raw_score_like = [c for c in df.columns if "Score" in str(c)]
        score_cols = _sla_score_data_columns(list(df.columns))
        excluded = [c for c in raw_score_like if c not in score_cols]
        result["score_columns"] = score_cols
        log_line(f"Base File loaded: {len(df)} rows, {len(df.columns)} columns.")
        log_line(f"Score snapshot columns (data): {len(score_cols)} — {score_cols[:12]}{'...' if len(score_cols) > 12 else ''}")
        if excluded:
            log_line(f"Excluded non-period 'Score' columns ({len(excluded)}): {excluded}")

        mg_col = _metric_group_column_name(list(df.columns))
        if mg_col not in df.columns:
            mg_col = None

        rows_processed = 0
        projects_created = 0
        metrics_cataloged = 0
        skipped_header = 0
        skipped_empty_metric = 0
        performance_cells_written = 0
        match_reasons: Counter[str] = Counter()

        for _index, row in df.iterrows():
            account_name = _xstr(row, "Project")
            perf_measure = _xstr(row, "Performance Measure")

            if not account_name or account_name.lower() in ("sr.", "project", "metrics"):
                skipped_header += 1
                continue
            low = perf_measure.lower()
            if "measure" in low or "metric" in low:
                skipped_header += 1
                continue

            project, reason = resolve_project_for_sla(db, account_name)
            if not project:
                project = Project(
                    account_name=account_name.strip(),
                    filename=source_basename,
                    source_filename=source_basename,
                )
                db.add(project)
                db.flush()
                ensure_project_client(db, project)
                projects_created += 1
                match_reasons["created_new"] += 1
            else:
                match_reasons[reason] += 1
                if project.client_id is None:
                    ensure_project_client(db, project)

            project.source_filename = source_basename
            # Only stamp filename when this ingest created the row (avoid hiding original upload source).
            if (project.filename or "").strip() == "":
                project.filename = source_basename

            reg = _xstr(row, "Region")
            if reg:
                project.region = reg
            ph = _xstr(row, "Practice Head")
            if ph:
                project.practice_head = ph
            sp = _xstr(row, "BE SPOC")
            if sp:
                project.be_spoc = sp
            cat = _xstr(row, "Category")
            if cat:
                project.category = cat

            metric_label = perf_measure.strip()
            if not metric_label:
                skipped_empty_metric += 1
                continue

            m_def = (
                db.query(MetricDefinition)
                .filter(
                    MetricDefinition.project_id == project.id,
                    MetricDefinition.metric_label == metric_label,
                )
                .first()
            )

            if not m_def:
                m_def = MetricDefinition(
                    project_id=project.id,
                    metric_label=metric_label,
                    source_filename=source_basename,
                )
                db.add(m_def)
                db.flush()
                metrics_cataloged += 1

            m_def.source_filename = source_basename
            if mg_col:
                m_def.metric_group = str(row.get(mg_col, "") or "")
            else:
                m_def.metric_group = ""
            if str(m_def.metric_group).lower() == "nan":
                m_def.metric_group = ""
            m_def.metric_nature = _xstr(row, "Metric Type")
            m_def.target_threshold = _xstr(row, "Target")
            m_def.definition = str(row.get("Metric Definition", "") or "")
            if m_def.definition.lower() == "nan":
                m_def.definition = ""
            m_def.calculation_method = str(row.get("Calculation Method", "") or "")
            if m_def.calculation_method.lower() == "nan":
                m_def.calculation_method = ""
            m_def.source_system = _xstr(row, "Measurement System")

            for s_col in score_cols:
                s_idx = df.columns.get_loc(s_col)
                status_col = df.columns[s_idx + 1] if s_idx + 1 < len(df.columns) else None

                month_key = str(s_col).replace("Score", "").strip()
                period_date = parse_sla_score_column_name(s_col)

                raw_score = _xstr(row, s_col)
                raw_status = _xstr(row, status_col) if status_col else ""

                if not raw_score and not raw_status:
                    continue

                performance_cells_written += 1

                if period_date:
                    canonical = canonical_month_label(period_date)
                    perf = (
                        db.query(SLAPerformance)
                        .filter(
                            SLAPerformance.definition_id == m_def.id,
                            SLAPerformance.period_start == period_date,
                        )
                        .first()
                    )
                    if not perf:
                        perf = SLAPerformance(
                            definition_id=m_def.id,
                            period_start=period_date,
                            reporting_month=canonical,
                            source_filename=source_basename,
                        )
                        db.add(perf)
                    perf.period_start = period_date
                    perf.reporting_month = canonical
                else:
                    perf = (
                        db.query(SLAPerformance)
                        .filter(
                            SLAPerformance.definition_id == m_def.id,
                            SLAPerformance.period_start.is_(None),
                            SLAPerformance.reporting_month == month_key,
                        )
                        .first()
                    )
                    if not perf:
                        perf = SLAPerformance(
                            definition_id=m_def.id,
                            reporting_month=month_key,
                            source_filename=source_basename,
                        )
                        db.add(perf)

                perf.source_filename = source_basename
                perf.score = raw_score
                perf.rag_status = raw_status

            rows_processed += 1
            if rows_processed % 100 == 0:
                log_line(f"Progress: {rows_processed} metric rows processed…")

        db.commit()
        log_line(
            f"Commit OK — metric_rows={rows_processed}, skipped_header={skipped_header}, "
            f"skipped_empty_metric={skipped_empty_metric}, new_projects={projects_created}, "
            f"new_metric_defs={metrics_cataloged}, performance_cells={performance_cells_written}, "
            f"match_reasons={dict(match_reasons)}",
            "info",
        )

        result.update(
            {
                "ok": True,
                "rows_processed": rows_processed,
                "rows_skipped_header": skipped_header,
                "rows_skipped_empty_metric": skipped_empty_metric,
                "projects_created": projects_created,
                "metrics_cataloged": metrics_cataloged,
                "performance_cells_written": performance_cells_written,
                "match_reasons": dict(match_reasons),
            }
        )
        return result

    except Exception as e:
        db.rollback()
        log_line(f"FATAL: {str(e)}", "error")
        import traceback

        tb = traceback.format_exc()
        logger.error(tb)
        for line in tb.strip().split("\n"):
            logs.append(f"  {line}")
        result["error"] = str(e)
        return result
    finally:
        if not external_session:
            db.close()


if __name__ == "__main__":
    _root = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
    DEFAULT_PATH = os.path.join(_root, "excel_files_imp", "Raw Data SLA Basefile.xlsx")
    target_file = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_PATH
    ingest_sla(target_file)
