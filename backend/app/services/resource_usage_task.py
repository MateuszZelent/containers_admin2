import asyncio
from typing import Optional
from datetime import datetime

from app.db.session import SessionLocal
from app.core.logging import logger
from app.services.resource_usage import ResourceUsageService


class ResourceUsageTask:
    def __init__(self, interval_minutes: int = 10):
        self.interval_minutes = interval_minutes
        self.interval_seconds = interval_minutes * 60
        self._task: Optional[asyncio.Task] = None
        self._running = False
        self._last_snapshot_time: Optional[datetime] = None
        self._total_snapshots = 0

    async def start(self):
        if self._running:
            logger.warning("Resource usage monitoring already running")
            return

        self._running = True
        self._task = asyncio.create_task(self._loop())
        logger.info(
            f"Started resource usage monitoring with "
            f"{self.interval_minutes} minute intervals"
        )

    async def stop(self):
        if not self._running:
            return
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        logger.info("Stopped resource usage monitoring")

    async def restart_with_new_interval(self, new_interval_minutes: int):
        """Restart monitoring with new interval"""
        logger.info(
            f"Restarting resource usage monitoring: "
            f"{self.interval_minutes} -> {new_interval_minutes} minutes"
        )
        await self.stop()
        self.interval_minutes = new_interval_minutes
        self.interval_seconds = new_interval_minutes * 60
        await self.start()

    def get_status(self) -> dict:
        """Get current monitoring status"""
        last_snapshot = (
            self._last_snapshot_time.isoformat()
            if self._last_snapshot_time else None
        )
        return {
            "interval_minutes": self.interval_minutes,
            "current_status": "active" if self._running else "inactive",
            "last_snapshot": last_snapshot,
            "total_snapshots": self._total_snapshots
        }

    async def _loop(self):
        while self._running:
            try:
                db = SessionLocal()
                try:
                    ResourceUsageService.record_snapshot(db)
                    self._last_snapshot_time = datetime.utcnow()
                    self._total_snapshots += 1
                finally:
                    db.close()
                await asyncio.sleep(self.interval_seconds)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error in resource usage monitoring: {e}")
                await asyncio.sleep(self.interval_seconds)


resource_usage_task = ResourceUsageTask(interval_minutes=10)
