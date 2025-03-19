import logging
import sys
from typing import Optional

from rich.console import Console
from rich.logging import RichHandler
from rich.theme import Theme
from rich.traceback import install as install_rich_traceback

from app.core.config import settings

# Install rich traceback handling
install_rich_traceback(show_locals=True)

# Create rich console with custom theme
console = Console(theme=Theme({
    "info": "cyan",
    "warning": "yellow",
    "error": "red",
    "debug": "grey50",
    "cluster": "green",
    "slurm": "blue",
    "ssh": "magenta",
}))

# Configure rich handler
rich_handler = RichHandler(
    console=console,
    rich_tracebacks=True,
    tracebacks_show_locals=True,
    markup=True,
    show_time=True,
    show_path=True
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
    handlers=[rich_handler]
)

def get_logger(name: Optional[str] = None) -> logging.Logger:
    """Get a logger instance with rich formatting."""
    return logging.getLogger(name or "slurm_container_manager")

# Create specific loggers for different components
cluster_logger = get_logger("cluster")
slurm_logger = get_logger("slurm")
ssh_logger = get_logger("ssh")

def log_command(logger: logging.Logger, command: str, sensitive: bool = False) -> None:
    """Log a command execution with proper formatting."""
    if sensitive:
        command = "<sensitive command>"
    logger.debug(f"[bold]Executing command:[/bold] {command}")

def log_ssh_connection(host: str, username: str, using_key: bool = True) -> None:
    """Log SSH connection attempt with details."""
    ssh_logger.debug(
        f"[bold]Initiating SSH connection[/bold]\n"
        f"  [cyan]Host:[/cyan] {host}\n"
        f"  [cyan]Username:[/cyan] {username}\n"
        f"  [cyan]Auth method:[/cyan] {'key-based' if using_key else 'password'}"
    )

def log_slurm_job(job_id: str, status: str, details: dict) -> None:
    """Log SLURM job information with rich formatting."""
    slurm_logger.debug(
        f"[bold]SLURM Job Update[/bold] [cyan]{job_id}[/cyan]\n"
        f"  [cyan]Status:[/cyan] {status}\n" +
        "\n".join(f"  [cyan]{k}:[/cyan] {v}" for k, v in details.items())
    )

def log_cluster_operation(operation: str, details: dict) -> None:
    """Log cluster operation with detailed information."""
    cluster_logger.debug(
        f"[bold]Cluster Operation:[/bold] {operation}\n" +
        "\n".join(f"  [cyan]{k}:[/cyan] {v}" for k, v in details.items())
    )