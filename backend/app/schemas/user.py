from pydantic import BaseModel, EmailStr, field_validator
from typing import Optional, List, Dict, Any
from app.core.utils import make_avatar_url_absolute


class UserBase(BaseModel):
    username: str
    email: Optional[EmailStr] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    max_containers: Optional[int] = 6
    max_gpus: Optional[int] = 24
    max_gpus_per_job: Optional[int] = None
    max_time_limit_hours: Optional[int] = None
    allowed_templates: Optional[List[str]] = None
    avatar_url: Optional[str] = None
    preferred_language: Optional[str] = "pl"


class UserCreate(UserBase):
    password: str
    is_active: Optional[bool] = True
    is_superuser: Optional[bool] = False


class UserUpdate(BaseModel):
    username: Optional[str] = None
    email: Optional[EmailStr] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    password: Optional[str] = None
    is_active: Optional[bool] = None
    is_superuser: Optional[bool] = None
    code_server_password: Optional[str] = None
    max_containers: Optional[int] = None
    max_gpus: Optional[int] = None
    max_gpus_per_job: Optional[int] = None
    max_time_limit_hours: Optional[int] = None
    allowed_templates: Optional[List[str]] = None
    avatar_url: Optional[str] = None
    preferred_language: Optional[str] = None


class UserInDBBase(UserBase):
    id: Optional[int] = None
    is_active: bool = True
    is_superuser: Optional[bool] = False
    code_server_password: Optional[str] = None
    max_containers: int = 6
    max_gpus: int = 24
    max_gpus_per_job: Optional[int] = None
    max_time_limit_hours: Optional[int] = None
    allowed_templates: Optional[List[str]] = None
    avatar_url: Optional[str] = None
    preferred_language: Optional[str] = "pl"

    class Config:
        from_attributes = True


class User(UserInDBBase):
    @field_validator('avatar_url')
    @classmethod
    def validate_avatar_url(cls, v: Optional[str]) -> Optional[str]:
        """Convert relative avatar URLs to absolute URLs."""
        return make_avatar_url_absolute(v)


class UserInDB(UserInDBBase):
    hashed_password: str


class UserWithUsage(User):
    """User schema with current resource usage information."""
    current_usage: Optional[Dict[str, Any]] = None
