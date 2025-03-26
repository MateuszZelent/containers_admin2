"""fix_database_schema

Revision ID: cb1d08d165e8
Revises: add_user_name_fields
Create Date: 2025-03-26 10:01:55.485975

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'cb1d08d165e8'
down_revision = 'add_user_name_fields'
branch_labels = None
depends_on = None

# ...existing code...
def upgrade():
    # Najpierw sprawdź, czy kolumny istnieją
    connection = op.get_bind()
    inspector = sa.inspect(connection)
    existing_columns = [col['name'] for col in inspector.get_columns('users')]

    # Dodaj code_server_password jeśli nie istnieje
    if 'code_server_password' not in existing_columns:
        op.add_column('users', sa.Column(
            'code_server_password',
            sa.String(length=255),
            nullable=True
        ))

    # Dodaj updated_at jeśli nie istnieje
    if 'updated_at' not in existing_columns:
        op.add_column('users', sa.Column(
            'updated_at',
            sa.DateTime(timezone=True),
            nullable=True
        ))

    # Nie używaj batch_alter_table - zamiast tego wykonuj pojedyncze zmiany
    op.execute('COMMIT')  # Zakończ bieżącą transakcję
    
    try:
        # Zmień właściwości kolumn jeśli istnieją
        if 'code_server_password' in existing_columns:
            op.alter_column('users', 'code_server_password',
                          existing_type=sa.String(length=255),
                          nullable=True,
                          postgresql_using='code_server_password::varchar(255)')
            
        if 'updated_at' in existing_columns:
            op.alter_column('users', 'updated_at',
                          existing_type=sa.DateTime(timezone=True),
                          nullable=True)
    except Exception as e:
        print(f"Warning: Could not modify columns: {e}")
        op.execute('ROLLBACK')


def downgrade():
    pass