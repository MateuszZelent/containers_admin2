"""Add SSH tunnel PID fields

Revision ID: 6ea3fd86500c
Revises: 12e70c512368
Create Date: 2025-06-05 15:01:38.231388

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '6ea3fd86500c'
down_revision = '12e70c512368'
branch_labels = None
depends_on = None


def upgrade():
    # Columns already exist in database, this migration is for documentation only
    pass


def downgrade():
    # Remove PID columns from ssh_tunnels table if needed
    # Commented out since these columns may be used elsewhere
    # op.drop_column('ssh_tunnels', 'health_status')
    # op.drop_column('ssh_tunnels', 'last_health_check')  
    # op.drop_column('ssh_tunnels', 'socat_pid')
    # op.drop_column('ssh_tunnels', 'ssh_pid')
    pass