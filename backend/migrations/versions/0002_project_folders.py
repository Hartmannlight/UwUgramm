"""Persist per-owner folders without changing existing project contents."""

import sqlalchemy as sa
from alembic import op

revision = "0002"
down_revision = "0001"


def upgrade():
    op.create_table(
        "folders",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("owner_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
    )
    op.create_index("ix_folders_owner_id", "folders", ["owner_id"])
    with op.batch_alter_table("projects") as batch:
        batch.add_column(sa.Column("folder_id", sa.String(36), nullable=True))
        batch.create_foreign_key(
            "fk_projects_folder_id", "folders", ["folder_id"], ["id"], ondelete="SET NULL"
        )
        batch.create_index("ix_projects_folder_id", ["folder_id"])


def downgrade():
    with op.batch_alter_table("projects") as batch:
        batch.drop_index("ix_projects_folder_id")
        batch.drop_constraint("fk_projects_folder_id", type_="foreignkey")
        batch.drop_column("folder_id")
    op.drop_table("folders")
