"""add host_file_path column

Revision ID: add_host_file_path
Revises: previous_revision_id
Create Date: 2025-05-09 15:20:33.123456

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'add_host_file_path'
down_revision = 'previous_revision_id'  # Replace with your previous migration ID
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('task_queue_jobs', sa.Column('host_file_path', sa.String(), nullable=True))


def downgrade():
    op.drop_column('task_queue_jobs', 'host_file_path')
