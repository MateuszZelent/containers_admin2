import asyncio
from typing import Optional
from sqlalchemy.orm import Session
from app.db.session import SessionLocal
from app.services.cluster_stats_monitor import ClusterStatsMonitorService
from app.core.logging import cluster_logger


class ClusterMonitoringTask:
    """Background task for periodic cluster monitoring."""

    def __init__(self, interval_minutes: int = 5):
        self.interval_minutes = interval_minutes
        self.interval_seconds = interval_minutes * 60
        self._task: Optional[asyncio.Task] = None
        self._running = False

    async def start(self):
        """Start the background monitoring task."""
        if self._running:
            cluster_logger.warning("Cluster monitoring is already running")
            return

        self._running = True
        self._task = asyncio.create_task(self._monitoring_loop())
        cluster_logger.info(
            f"Started cluster monitoring with {self.interval_minutes} minute intervals"
        )

    async def stop(self):
        """Stop the background monitoring task."""
        if not self._running:
            return

        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass

        cluster_logger.info("Stopped cluster monitoring")

    async def _monitoring_loop(self):
        """Main monitoring loop."""
        while self._running:
            try:
                # Create database session
                db = SessionLocal()
                try:
                    # Create monitor service and update stats
                    monitor_service = ClusterStatsMonitorService(db)
                    success = await monitor_service.update_cluster_stats()

                    if success:
                        cluster_logger.debug("Cluster stats updated successfully")
                    else:
                        cluster_logger.warning("Failed to update cluster stats")

                finally:
                    db.close()

                # Wait for next iteration
                await asyncio.sleep(self.interval_seconds)

            except asyncio.CancelledError:
                break
            except Exception as e:
                cluster_logger.error(f"Error in cluster monitoring loop: {str(e)}")
                # Continue running even if there's an error
                await asyncio.sleep(self.interval_seconds)


# Global instance
cluster_monitoring_task = ClusterMonitoringTask(interval_minutes=5)
