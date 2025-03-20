"""Add first_name and last_name to users table

Revision ID: add_user_name_fields
Revises: 1d8bc25ab866
Create Date: 2025-03-25 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'add_user_name_fields'
down_revision = '1d8bc25ab866'
branch_labels = None
depends_on = None


def upgrade():
    # Add first_name and last_name columns to users table
    op.add_column('users', sa.Column('first_name', sa.String(), nullable=True))
    op.add_column('users', sa.Column('last_name', sa.String(), nullable=True))


def downgrade():
    # Remove first_name and last_name columns from users table
    op.drop_column('users', 'last_name')
    op.drop_column('users', 'first_name')
