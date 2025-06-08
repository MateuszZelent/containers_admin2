"""merge migrations

Revision ID: 12e70c512368
Revises: 09a2736507c5, d7c74c42412c
Create Date: 2025-06-05 12:34:46.866414

"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "12e70c512368"
down_revision = ("09a2736507c5", "d7c74c42412c")
branch_labels = None
depends_on = None


def upgrade():
    pass


def downgrade():
    pass
