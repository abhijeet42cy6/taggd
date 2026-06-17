"""Add indexes and unique constraints for production PostgreSQL."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260617_0001"
down_revision: Union[str, None] = "20260616_0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _index_names(table: str) -> set[str]:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    return {idx["name"] for idx in insp.get_indexes(table)}


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)

    if insp.has_table("records"):
        names = _index_names("records")
        if "ix_records_project_id" not in names:
            op.create_index("ix_records_project_id", "records", ["project_id"], unique=False)

    if insp.has_table("finance_monthly_ledger"):
        names = _index_names("finance_monthly_ledger")
        if "ix_finance_ledger_project_month" not in names:
            op.create_index(
                "ix_finance_ledger_project_month",
                "finance_monthly_ledger",
                ["project_id", "reporting_month"],
                unique=False,
            )
        if "uq_finance_ledger_proj_month_cat" not in names:
            op.create_index(
                "uq_finance_ledger_proj_month_cat",
                "finance_monthly_ledger",
                ["project_id", "reporting_month", "metric_category"],
                unique=True,
            )

    if insp.has_table("finance_cash_flow"):
        names = _index_names("finance_cash_flow")
        if "uq_finance_cash_proj_month" not in names:
            op.create_index(
                "uq_finance_cash_proj_month",
                "finance_cash_flow",
                ["project_id", "reporting_month"],
                unique=True,
            )


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)

    if insp.has_table("finance_cash_flow"):
        names = _index_names("finance_cash_flow")
        if "uq_finance_cash_proj_month" in names:
            op.drop_index("uq_finance_cash_proj_month", table_name="finance_cash_flow")

    if insp.has_table("finance_monthly_ledger"):
        names = _index_names("finance_monthly_ledger")
        if "uq_finance_ledger_proj_month_cat" in names:
            op.drop_index("uq_finance_ledger_proj_month_cat", table_name="finance_monthly_ledger")
        if "ix_finance_ledger_project_month" in names:
            op.drop_index("ix_finance_ledger_project_month", table_name="finance_monthly_ledger")

    if insp.has_table("records"):
        names = _index_names("records")
        if "ix_records_project_id" in names:
            op.drop_index("ix_records_project_id", table_name="records")
