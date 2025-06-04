import os
from fastapi import FastAPI, Depends, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.logging import logger, console
from app.db.session import get_db, engine
from app.db.models import Base
from app.routers import auth, users, jobs, task_queue, cli_tokens
import debugpy

# Ustaw punkt nasłuchiwania debuggera
debugpy.listen(("0.0.0.0", 5678))  # Port 5678
print("Debugger is active. Waiting for client to attach...")
# Create database tables
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title=settings.PROJECT_NAME, openapi_url=f"{settings.API_V1_STR}/openapi.json"
)

# Set up CORS with specific configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.BACKEND_CORS_ORIGINS,  # Use settings from config
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
    max_age=3600,  # Cache preflight requests for 1 hour
)

# Include API routers
app.include_router(auth.router, prefix=f"{settings.API_V1_STR}/auth", tags=["auth"])
app.include_router(users.router, prefix=f"{settings.API_V1_STR}/users", tags=["users"])
app.include_router(jobs.router, prefix=f"{settings.API_V1_STR}/jobs", tags=["jobs"])
app.include_router(
    task_queue.router, prefix=f"{settings.API_V1_STR}/tasks", tags=["tasks"]
)
app.include_router(
    cli_tokens.router, prefix=f"{settings.API_V1_STR}/cli-tokens", tags=["cli-tokens"]
)


@app.on_event("startup")
async def startup_event():
    """Initialize application at startup."""
    logger.info(f"[bold green]Starting {settings.PROJECT_NAME}[/bold green]")
    logger.info(f"Debug mode: {settings.DEBUG}")
    logger.info(f"Log level: {settings.LOG_LEVEL}")
    logger.info("Configuration loaded:")
    logger.info(f"  [cyan]SLURM Host:[/cyan] {settings.SLURM_HOST}")
    logger.info(f"  [cyan]SLURM User:[/cyan] {settings.SLURM_USER}")
    logger.info(f"  [cyan]Template Directory:[/cyan] {settings.TEMPLATE_DIR}")
    logger.info(
        f"  [cyan]Container Output Directory:[/cyan] {settings.CONTAINER_OUTPUT_DIR}"
    )

    # Start the task queue processor
    logger.info("Starting task queue processor")
    try:
        background_tasks = BackgroundTasks()
        db = next(get_db())
        from app.services.task_queue import TaskQueueService

        task_service = TaskQueueService(db)
        await task_service.start_queue_processor(background_tasks)
        logger.info("Task queue processor started successfully")
    except Exception as e:
        logger.error(f"Failed to start task queue processor: {str(e)}")

    # Start the SLURM sync service
    logger.info("Starting SLURM sync service")
    try:
        db = next(get_db())
        from app.services.slurm_sync import SlurmSyncService

        slurm_sync_service = SlurmSyncService(db)
        await slurm_sync_service.start_background_sync()
        logger.info("SLURM sync service started successfully")
    except Exception as e:
        logger.error(f"Failed to start SLURM sync service: {str(e)}")


@app.get("/")
def read_root():
    return {"message": "Welcome to the SLURM Container Manager API"}


@app.get("/health")
async def health_check(db: Session = Depends(get_db)):
    try:
        # Sprawdź połączenie z bazą danych
        result = db.execute(text("SELECT 1")).scalar()
        return {"status": "ok", "database_connection": True, "database_result": result}
    except Exception as e:
        return {"status": "error", "database_connection": False, "error": str(e)}


# Create a first user if no users exist (useful for first run)
@app.on_event("startup")
async def create_first_user():
    from app.services.user import UserService
    from app.schemas.user import UserCreate

    logger.info("Checking for initial admin user...")
    db = next(get_db())
    user = UserService.get_by_username(db=db, username=settings.ADMIN_USERNAME)
    if not user:
        logger.info("Creating initial admin user...")
        user_in = UserCreate(
            username=settings.ADMIN_USERNAME,
            email=settings.ADMIN_EMAIL,
            password=settings.ADMIN_PASSWORD,
            first_name=settings.ADMIN_FIRST_NAME,
            last_name=settings.ADMIN_LAST_NAME,
        )
        UserService.create(db=db, user_in=user_in)
        logger.info("[green]Admin user created successfully[/green]")
    else:
        logger.info("Admin user already exists")


@app.on_event("startup")
async def restore_ssh_tunnels():
    """Restore SSH tunnels from database after server restart."""
    logger.info("Restoring SSH tunnels after server startup")
    try:
        # Get a database session
        db = next(get_db())
        # Create SSH tunnel service
        from app.services.ssh_tunnel import SSHTunnelService

        tunnel_service = SSHTunnelService(db)
        # Restore active tunnels
        result = await tunnel_service.restore_active_tunnels()
        logger.info(f"SSH tunnel restoration complete: {result}")
    except Exception as e:
        logger.error(f"Error restoring SSH tunnels: {str(e)}")


if __name__ == "__main__":
    import uvicorn

    console.print("[bold green]Starting development server...[/bold green]")
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level=settings.LOG_LEVEL.lower(),
    )
