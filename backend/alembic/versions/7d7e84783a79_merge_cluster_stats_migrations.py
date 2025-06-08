"""merge_cluster_stats_migrations

Revision ID: 7d7e84783a79
Revises: 10_add_cluster_stats, 6ea3fd86500c
Create Date: 2025-06-05 20:04:18.906421

"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "7d7e84783a79"
down_revision = ("10_add_cluster_stats", "6ea3fd86500c")
branch_labels = None
depends_on = None


def upgrade():
    pass


def downgrade():
    pass
