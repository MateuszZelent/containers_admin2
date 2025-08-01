from typing import Optional, List, Dict, Any

from sqlalchemy.orm import Session

from app.core.security import get_password_hash, verify_password
from app.db.models import User
from app.schemas.user import UserCreate, UserUpdate


class UserService:
    @staticmethod
    def get(db: Session, user_id: int) -> Optional[User]:
        return db.query(User).filter(User.id == user_id).first()

    @staticmethod
    def get_by_username(db: Session, username: str) -> Optional[User]:
        return db.query(User).filter(User.username == username).first()

    @staticmethod
    def get_by_email(db: Session, email: str) -> Optional[User]:
        return db.query(User).filter(User.email == email).first()

    @staticmethod
    def get_multi(db: Session, skip: int = 0, limit: int = 100) -> List[User]:
        return db.query(User).offset(skip).limit(limit).all()

    @staticmethod
    def authenticate(db: Session, username: str, password: str) -> Optional[User]:
        user = UserService.get_by_username(db, username)
        if not user:
            return None
        if not verify_password(password, user.hashed_password):
            return None
        return user

    @staticmethod
    def create(db: Session, user_in: UserCreate) -> User:
        db_user = User(
            username=user_in.username,
            email=user_in.email,
            first_name=user_in.first_name,
            last_name=user_in.last_name,
            hashed_password=get_password_hash(user_in.password),
            is_active=getattr(user_in, "is_active", True),
            is_superuser=getattr(user_in, "is_superuser", False),
        )
        db.add(db_user)
        db.commit()
        db.refresh(db_user)
        return db_user

    @staticmethod
    def update(db: Session, user: User, user_in: UserUpdate) -> User:
        update_data = user_in.dict(exclude_unset=True)
        if update_data.get("password"):
            hashed_password = get_password_hash(update_data["password"])
            del update_data["password"]
            update_data["hashed_password"] = hashed_password

        for field, value in update_data.items():
            setattr(user, field, value)

        db.add(user)
        db.commit()
        db.refresh(user)
        return user

    @staticmethod
    def remove(db: Session, user_id: int) -> Optional[User]:
        user = db.query(User).filter(User.id == user_id).first()
        if user:
            db.delete(user)
            db.commit()
        return user

    @staticmethod
    def get_user_current_usage(db: Session, user: User) -> Dict[str, Any]:
        """
        Calculate user's current resource usage.
        
        Returns:
            Dict with current usage stats including containers, GPUs, CPUs, memory
        """
        from app.db.models import Job, TaskQueueJob
        
        # Get active container jobs
        active_container_jobs = (
            db.query(Job)
            .filter(
                Job.owner_id == user.id,
                Job.status.in_(["CONFIGURING", "RUNNING"])
            )
            .all()
        )
        
        # Get active task queue jobs
        active_task_jobs = (
            db.query(TaskQueueJob)
            .filter(
                TaskQueueJob.owner_id == user.id,
                TaskQueueJob.status.in_(["CONFIGURING", "RUNNING", "PENDING"])
            )
            .all()
        )
        
        # Calculate totals
        total_containers = len(active_container_jobs)
        total_gpus = sum(job.num_gpus or 0 for job in active_container_jobs)
        total_cpus = sum(job.num_cpus or 0 for job in active_container_jobs)
        total_memory_gb = sum(job.memory_gb or 0 for job in active_container_jobs)
        
        # Add task queue resources
        task_gpus = sum(job.num_gpus or 0 for job in active_task_jobs)
        task_cpus = sum(job.num_cpus or 0 for job in active_task_jobs)
        task_memory_gb = sum(job.memory_gb or 0 for job in active_task_jobs)
        
        total_gpus += task_gpus
        total_cpus += task_cpus
        total_memory_gb += task_memory_gb
        total_tasks = len(active_task_jobs)
        
        # Calculate usage percentages (safely extract values)
        containers_limit = getattr(user, 'max_containers', None) or 6
        gpus_limit = getattr(user, 'max_gpus', None) or 24
        
        containers_pct = round((total_containers / containers_limit) * 100, 1)
        gpus_pct = round((total_gpus / gpus_limit) * 100, 1)
        
        return {
            "containers": {
                "current": total_containers,
                "limit": containers_limit,
                "percentage": containers_pct
            },
            "gpus": {
                "current": total_gpus,
                "limit": gpus_limit,
                "percentage": gpus_pct
            },
            "tasks": {
                "current": total_tasks,
                "active_jobs": len(active_container_jobs),
                "active_tasks": len(active_task_jobs)
            },
            "resources": {
                "cpus_used": total_cpus,
                "memory_gb_used": total_memory_gb,
                "containers_breakdown": {
                    "running": sum(1 for j in active_container_jobs
                                   if str(j.status) == "RUNNING"),
                    "configuring": sum(1 for j in active_container_jobs
                                       if str(j.status) == "CONFIGURING")
                },
                "tasks_breakdown": {
                    "running": sum(1 for j in active_task_jobs
                                   if str(j.status) == "RUNNING"),
                    "configuring": sum(1 for j in active_task_jobs
                                       if str(j.status) == "CONFIGURING"),
                    "pending": sum(1 for j in active_task_jobs
                                   if str(j.status) == "PENDING")
                }
            }
        }
