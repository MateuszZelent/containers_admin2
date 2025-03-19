"""Add is_superuser column to users table

Revision ID: 031067207c3f
Revises: 6457d4ff3953
Create Date: 2025-03-19 12:11:10.566521

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '031067207c3f'
down_revision = '6457d4ff3953'
branch_labels = None
depends_on = None

def upgrade():
    # Create a new table
    op.create_table('users_new',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('username', sa.String(), nullable=True),
        sa.Column('hashed_password', sa.String(), nullable=True),
        sa.Column('email', sa.String(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=True),
        sa.Column('is_superuser', sa.Boolean(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    
    # Copy data
    op.execute('INSERT INTO users_new SELECT id, username, hashed_password, email, is_active, is_superuser, created_at, updated_at FROM users')
    
    # Drop old table
    op.drop_table('users')
    
    # Rename new table
    op.rename_table('users_new', 'users')
    
    # Create indexes and constraints
    op.create_index(op.f('ix_users_id'), 'users', ['id'], unique=False)
    op.create_index(op.f('ix_users_username'), 'users', ['username'], unique=True)
    op.create_index(op.f('ix_users_email'), 'users', ['email'], unique=True)

def downgrade():
    # Create a new table with not null constraint
    op.create_table('users_new',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('username', sa.String(), nullable=True),
        sa.Column('hashed_password', sa.String(), nullable=True),
        sa.Column('email', sa.String(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=True),
        sa.Column('is_superuser', sa.Boolean(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    
    # Copy data
    op.execute('INSERT INTO users_new SELECT id, username, hashed_password, email, is_active, is_superuser, created_at, updated_at FROM users')
    
    # Drop indexes first
    op.drop_index(op.f('ix_users_email'), table_name='users')
    op.drop_index(op.f('ix_users_username'), table_name='users')
    op.drop_index(op.f('ix_users_id'), table_name='users')
    
    # Drop and rename tables
    op.drop_table('users')
    op.rename_table('users_new', 'users')
    
    # Recreate indexes and constraints
    op.create_index(op.f('ix_users_id'), 'users', ['id'], unique=False)
    op.create_index(op.f('ix_users_username'), 'users', ['username'], unique=True)
    op.create_index(op.f('ix_users_email'), 'users', ['email'], unique=True)