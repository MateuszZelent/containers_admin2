import sys
import os
from sqlalchemy import create_engine, Column, String
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

# Add the project root to the Python path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

# Import database URL from settings
from app.core.config import settings


def run_migration():
    """Run the migration to add code_server_password column"""
    print("Starting migration to add code_server_password column...")

    # Connect to the database
    engine = create_engine(settings.DATABASE_URL)

    # Check if column already exists
    with engine.connect() as conn:
        # Get table info
        result = conn.execute("PRAGMA table_info(users)")
        columns = [row[1] for row in result.fetchall()]

        # Add column if it doesn't exist
        if "code_server_password" not in columns:
            print("Adding code_server_password column to users table...")
            conn.execute("ALTER TABLE users ADD COLUMN code_server_password VARCHAR")
            print("Column added successfully.")
        else:
            print("Column code_server_password already exists, skipping.")

    print("Migration completed.")


if __name__ == "__main__":
    run_migration()
