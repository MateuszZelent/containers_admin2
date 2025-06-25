"""
Add time_left and time_used columns to jobs table
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'add_time_left_time_used_to_jobs'
down_revision = None  # Uzupełnij jeśli masz poprzednią migrację
branch_labels = None
depends_on = None

def upgrade():
    op.add_column('jobs', sa.Column('time_left', sa.String(), nullable=True))
    op.add_column('jobs', sa.Column('time_used', sa.String(), nullable=True))

def downgrade():
    op.drop_column('jobs', 'time_left')
    op.drop_column('jobs', 'time_used')
