from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import QueuePool

from app.core.config import settings
from app.core.logging import db_logger

# Improved engine configuration with better connection pooling
engine = create_engine(
    # Use DATABASE_URL instead of SQLALCHEMY_DATABASE_URI
    settings.DATABASE_URL,
    # Increase pool size from default 10
    pool_size=20,
    # Increase max overflow from default 20
    max_overflow=30,
    # Set pool recycle to avoid stale connections
    pool_recycle=3600,
    # Increase timeout slightly
    pool_timeout=60,
    # Enable connection pre-ping to detect stale connections
    pool_pre_ping=True,
    echo=settings.SQLALCHEMY_ECHO if hasattr(settings, "SQLALCHEMY_ECHO") else False,
)

db_logger.info(f"Database pool configured: size={20}, max_overflow={30}, timeout={60}s")

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


# Add utility function to safely close a session
def close_session(session):
    """Safely closes a session, handling any errors."""
    try:
        session.close()
        return True
    except Exception as e:
        db_logger.error(f"Error closing database session: {str(e)}")
        return False


def get_db():
    db = SessionLocal()
    try:
        yield db
    except Exception as e:
        db_logger.error(f"Database session error: {str(e)}")
        db.rollback()
        raise
    finally:
        close_session(db)
