"""Initial schema from SQLAlchemy models (PostgreSQL).

Revision ID: 20260519_0001
Revises:
Create Date: 2026-05-19

"""

from typing import Sequence, Union

from alembic import op

revision: str = "20260519_0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    from backend.db.database import Base

    bind = op.get_bind()
    Base.metadata.create_all(bind=bind)


def downgrade() -> None:
    from backend.db.database import Base

    bind = op.get_bind()
    Base.metadata.drop_all(bind=bind)
