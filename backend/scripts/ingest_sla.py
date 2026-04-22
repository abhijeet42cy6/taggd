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
    print(f"--- Starting SLA Ingestion for {os.path.basename(file_path)} ---")

    if not os.path.exists(file_path):
        print(f"Error: File not found at {file_path}")
        return None

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
        "match_reasons": {},
    }

    try:
        bf = backfill_sla_period_starts(db)
        if bf:
            print(f"Aligned {bf} legacy SLA performance rows to calendar months.")

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
        score_cols = [c for c in df.columns if "Score" in str(c)]
        print(f"Identified {len(score_cols)} performance snapshot columns.")

        rows_processed = 0
        projects_created = 0
        metrics_cataloged = 0
        skipped_header = 0
        skipped_empty_metric = 0
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
            m_def.metric_group = str(
                row.get("Metrics to be picked of BE Score (Measure Name as per standard Metrics)", "") or ""
            )
            if m_def.metric_group.lower() == "nan":
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
            if rows_processed % 50 == 0:
                print(f"Processed {rows_processed} metric rows...")

        db.commit()
        print("\n--- Ingestion Complete ---")
        print(f"Metric rows processed: {rows_processed}")
        print(f"New projects created: {projects_created}")
        print(f"New metric definitions this run: {metrics_cataloged}")
        print(f"Project match reasons: {dict(match_reasons)}")

        result.update(
            {
                "ok": True,
                "rows_processed": rows_processed,
                "rows_skipped_header": skipped_header,
                "rows_skipped_empty_metric": skipped_empty_metric,
                "projects_created": projects_created,
                "metrics_cataloged": metrics_cataloged,
                "match_reasons": dict(match_reasons),
            }
        )
        return result

    except Exception as e:
        db.rollback()
        print(f"FATAL ERROR during ingestion: {str(e)}")
        import traceback

        traceback.print_exc()
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
