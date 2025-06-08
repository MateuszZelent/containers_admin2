import logging
import sys
from typing import Optional, Dict, Any
import json

from rich.console import Console
from rich.logging import RichHandler
from rich.theme import Theme
from rich.traceback import install as install_rich_traceback

from app.core.config import settings

# Install rich traceback handling
install_rich_traceback(show_locals=True)

# Create rich console with custom theme
console = Console(
    theme=Theme(
        {
            "info": "cyan",
            "warning": "yellow",
            "error": "red",
            "debug": "grey50",
            "cluster": "green",
            "slurm": "blue",
            "ssh": "magenta",
        }
    )
)

# Configure rich handler
rich_handler = RichHandler(
    console=console,
    rich_tracebacks=True,
    tracebacks_show_locals=True,
    markup=True,
    show_time=True,
    show_path=True,
)

# Create logger
logger = logging.getLogger("slurm_container_manager")
logger.setLevel(logging.DEBUG if settings.DEBUG else logging.INFO)

# Remove existing handlers and add rich handler
logger.handlers = []
logger.addHandler(rich_handler)

# Set logging format
logging.basicConfig(
    level=logging.DEBUG if settings.DEBUG else logging.INFO,
    format="%(message)s",
    datefmt="[%X]",
    handlers=[rich_handler],
)


def get_logger(name: Optional[str] = None) -> logging.Logger:
    """Get a logger instance with rich formatting."""
    logger_name = name or "slurm_container_manager"
    logger = logging.getLogger(logger_name)

    # Configure logger if not already configured
    if not logger.handlers:
        logger.setLevel(logging.DEBUG if settings.DEBUG else logging.INFO)
        logger.addHandler(rich_handler)
        logger.propagate = False

    return logger


# Create specific loggers for different components
cluster_logger = logging.getLogger("cluster")
slurm_logger = logging.getLogger("slurm")
ssh_logger = logging.getLogger("ssh")

# Configure each logger
for log in [cluster_logger, slurm_logger, ssh_logger]:
    if log is not None:  # Safety check
        log.setLevel(logging.DEBUG if settings.DEBUG else logging.INFO)
        log.addHandler(rich_handler)
        log.propagate = False

# Add the database logger
db_logger = logging.getLogger("db")
if db_logger is not None:
    db_logger.setLevel(logging.INFO)
    db_logger.addHandler(rich_handler)
    db_logger.propagate = False


def log_command(logger: logging.Logger, command: str, sensitive: bool = False) -> None:
    """Log a command execution with proper formatting."""
    if sensitive:
        logger.debug(f"[bold]Executing command:[/bold] <sensitive command>")
    else:
        logger.debug(f"[bold]Executing command:[/bold] {command}")


def log_ssh_connection(host: str, username: str, using_key: bool = True) -> None:
    """Log SSH connection attempt with details."""
    ssh_logger.debug(
        f"[bold]Initiating SSH connection[/bold]\n"
        f"  [cyan]Host:[/cyan] {host}\n"
        f"  [cyan]Username:[/cyan] {username}\n"
        f"  [cyan]Auth method:[/cyan] "
        f"{'key-based' if using_key else 'password'}"
    )


def log_slurm_job(job_id: str, status: str, details: dict) -> None:
    """Log SLURM job information with rich formatting."""
    slurm_logger.debug(
        f"[bold]SLURM Job Update[/bold] [cyan]{job_id}[/cyan]\n"
        f"  [cyan]Status:[/cyan] {status}\n"
        + "\n".join(f"  [cyan]{k}:[/cyan] {v}" for k, v in details.items())
    )


def log_cluster_operation(operation: str, details: dict) -> None:
    """Log cluster operation with detailed information."""
    cluster_logger.debug(
        f"[bold]Cluster Operation:[/bold] {operation}\n"
        + "\n".join(f"  [cyan]{k}:[/cyan] {v}" for k, v in details.items())
    )


# Add a specific log function for database operations
def log_db_operation(operation: str, details: Optional[Dict[str, Any]] = None) -> None:
    """Log a database operation with optional details."""
    log_message = f"DB: {operation}"
    if details:
        log_message += f" | {json.dumps(details, indent=2)}"
    db_logger.info(log_message)
