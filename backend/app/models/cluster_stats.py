from sqlalchemy import Column, Integer, String, DateTime
from sqlalchemy.sql import func

from app.db.models import Base


class ClusterStats(Base):
    """Model for storing cluster statistics from PCSS monitoring."""

    __tablename__ = "cluster_stats"

    id = Column(Integer, primary_key=True, index=True)

    # Węzły (nodes)
    free_nodes = Column(Integer, nullable=False)
    busy_nodes = Column(Integer, nullable=False)
    sleeping_nodes = Column(Integer, nullable=False)  # power saving nodes
    total_nodes = Column(Integer, nullable=False)

    # GPU
    free_gpus = Column(Integer, nullable=False)
    active_gpus = Column(Integer, nullable=False)  # aktywne GPU
    standby_gpus = Column(Integer, nullable=False)  # standby GPU
    busy_gpus = Column(Integer, nullable=False)  # zajęte GPU
    total_gpus = Column(Integer, nullable=False)

    timestamp = Column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )
    source = Column(String, nullable=True)  # e.g., "pcss_monitor"
