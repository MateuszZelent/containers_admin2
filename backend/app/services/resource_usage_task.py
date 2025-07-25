import asyncio
from typing import Optional

from app.db.session import SessionLocal
from app.core.logging import logger
from app.services.resource_usage import ResourceUsageService


class ResourceUsageTask:
    def __init__(self, interval_minutes: int = 10):
        self.interval_minutes = interval_minutes
        self.interval_seconds = interval_minutes * 60
        self._task: Optional[asyncio.Task] = None
        self._running = False

    async def start(self):
        if self._running:
            logger.warning("Resource usage monitoring already running")
            return

        self._running = True
        self._task = asyncio.create_task(self._loop())
        logger.info(
            f"Started resource usage monitoring with {self.interval_minutes} minute intervals"
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

    async def _loop(self):
        while self._running:
            try:
                db = SessionLocal()
                try:
                    ResourceUsageService.record_snapshot(db)
                finally:
                    db.close()
                await asyncio.sleep(self.interval_seconds)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error in resource usage monitoring: {e}")
                await asyncio.sleep(self.interval_seconds)


resource_usage_task = ResourceUsageTask(interval_minutes=10)
