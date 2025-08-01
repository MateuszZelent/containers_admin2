import asyncio
from typing import Optional, Dict
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
        self._last_update: Optional[str] = None
        self._update_count = 0

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

    async def restart_with_new_interval(self, interval_minutes: int):
        """Restart monitoring with new interval."""
        cluster_logger.info(
            f"Restarting cluster monitoring with new interval: {interval_minutes} minutes"
        )
        await self.stop()
        self.interval_minutes = interval_minutes
        self.interval_seconds = interval_minutes * 60
        await self.start()

    def get_status(self) -> Dict:
        """Get current monitoring status."""
        return {
            "interval_minutes": self.interval_minutes,
            "current_status": "active" if self._running else "inactive",
            "last_update": self._last_update,
            "update_count": self._update_count
        }

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
                        self._update_count += 1
                        from datetime import datetime
                        self._last_update = datetime.now().isoformat()
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
