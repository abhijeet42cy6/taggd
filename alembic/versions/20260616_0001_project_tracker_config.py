"""Add projects.tracker_config for per-client upload validation."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260616_0001"
down_revision: Union[str, None] = "20260519_0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    cols = {c["name"] for c in insp.get_columns("projects")}
    if "tracker_config" not in cols:
        op.add_column("projects", sa.Column("tracker_config", sa.JSON(), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    cols = {c["name"] for c in insp.get_columns("projects")}
    if "tracker_config" in cols:
        op.drop_column("projects", "tracker_config")
