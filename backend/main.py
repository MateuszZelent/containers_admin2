import os
from fastapi import FastAPI, Depends, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.logging import logger, console
from app.db.session import get_db, engine
from app.db.models import Base
from app.routers import auth, users, jobs, task_queue, cli_tokens, cluster
from app.routes import monitoring
import app.websocket.routes as websocket
import debugpy

# Import cluster monitoring
from app.services.cluster_monitoring_task import cluster_monitoring_task
from app.services.domain_monitor import domain_monitor
from app.services.resource_usage_task import resource_usage_task

# Debug mode only for development
# debugpy.listen(("0.0.0.0", 5678))  # Port 5678
# print("Debugger is active. Waiting for client to attach...")

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

app.include_router(
    cluster.router, prefix=f"{settings.API_V1_STR}/cluster", tags=["cluster"]
)

app.include_router(
    monitoring.router, prefix=f"{settings.API_V1_STR}/admin", tags=["admin"]
)

app.include_router(websocket.router)

# Mount static files for avatars
app.mount("/static", StaticFiles(directory="static"), name="static")


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

    # Start the SLURM monitoring service
    logger.info("Starting SLURM monitoring service")
    try:
        from app.services.slurm_monitor import monitor_service

        # Increase interval to reduce SLURM load - check every 2 minutes
        await monitor_service.start_monitoring(interval_seconds=120)
        logger.info("SLURM monitoring service started (120s interval)")
    except Exception as e:
        logger.error(f"Failed to start SLURM monitoring service: {str(e)}")

    # Start the SLURM detail fetcher service
    logger.info("Starting SLURM detail fetcher service")
    try:
        from app.services.slurm import SlurmSSHService
        from app.services.task_queue import TaskQueueService
        from app.services.slurm_detail_fetcher import (
            init_slurm_detail_fetcher,
            get_slurm_detail_fetcher
        )

        # Create services
        slurm_service = SlurmSSHService()
        db = next(get_db())
        task_service = TaskQueueService(db)
        
        # Initialize and start the detail fetcher
        init_slurm_detail_fetcher(slurm_service, task_service)
        detail_fetcher = get_slurm_detail_fetcher()
        
        # Set the detail fetcher reference in task service
        task_service.set_detail_fetcher(detail_fetcher)
        
        await detail_fetcher.start()
        logger.info("SLURM detail fetcher service started")
    except Exception as e:
        logger.error(f"Failed to start SLURM detail fetcher: {str(e)}")

    # Start cluster monitoring
    await cluster_monitoring_task.start()
    logger.info("Background cluster monitoring started")

    # Start resource usage monitoring
    await resource_usage_task.start()
    logger.info("Resource usage monitoring started")

    # Start domain monitoring
    await domain_monitor.start()
    logger.info("Background domain monitoring started")


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
# @app.on_event("startup")
# async def create_first_user():
#     from app.services.user import UserService
#     from app.schemas.user import UserCreate

#     logger.info("Checking for initial admin user...")
#     db = next(get_db())
#     user = UserService.get_by_username(db=db, username=settings.ADMIN_USERNAME)
#     if not user:
#         logger.info("Creating initial admin user...")
#         user_in = UserCreate(
#             username=settings.ADMIN_USERNAME,
#             email=settings.ADMIN_EMAIL,
#             password=settings.ADMIN_PASSWORD,
#             first_name=settings.ADMIN_FIRST_NAME,
#             last_name=settings.ADMIN_LAST_NAME,
#             is_superuser=True,
#         )
#         UserService.create(db=db, user_in=user_in)
#         logger.info("[green]Admin user created successfully[/green]")
#     else:
#         logger.info("Admin user already exists")


# @app.on_event("startup")
# async def restore_ssh_tunnels():
#     """Restore SSH tunnels from database after server restart."""
#     logger.info("Restoring SSH tunnels after server startup")
#     try:
#         # Get a database session
#         db = next(get_db()) 
#         # Create SSH tunnel service
#         from app.services.ssh_tunnel import SSHTunnelService

#         tunnel_service = SSHTunnelService()
#         # Restore active tunnels
#         result = await tunnel_service.restore_active_tunnels()
#         logger.info(f"SSH tunnel restoration complete: {result}")
#     except Exception as e:
#         logger.error(f"Error restoring SSH tunnels: {str(e)}")


@app.on_event("shutdown")
async def shutdown_event():
    """Clean up on application shutdown."""
    logger.info(f"Shutting down {settings.PROJECT_NAME}")

    # Stop background services
    # await cluster_monitoring_task.stop()
    # await resource_usage_task.stop()
    logger.info("Background cluster monitoring stopped")


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
