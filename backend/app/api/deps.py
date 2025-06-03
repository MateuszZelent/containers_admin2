from app.db.session import SessionLocal, close_session
from app.core.logging import db_logger


# Improved dependency with proper error handling and connection release
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
