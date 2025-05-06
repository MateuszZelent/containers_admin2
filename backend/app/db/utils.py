"""Database utilities to help with connection management and retries."""
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type
from sqlalchemy.exc import OperationalError, TimeoutError

from app.core.logging import db_logger

# Configure retry decorators for database operations
db_retry = retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=1, max=10),
    retry=retry_if_exception_type((OperationalError, TimeoutError)),
    before_sleep=lambda retry_state: db_logger.warning(
        f"Database operation failed, retrying ({retry_state.attempt_number}/3): "
        f"{retry_state.outcome.exception()}"
    )
)

def get_connection_status():
    """Return database connection pool statistics."""
    from app.db.session import engine
    return {
        "pool_size": engine.pool.size(),
        "checkedin": engine.pool.checkedin(),
        "checkedout": engine.pool.checkedout(),
        "overflow": engine.pool.overflow(),
        "status": "healthy" if engine.pool.checkedout() < engine.pool.size() else "busy"
    }
