from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class CLITokenBase(BaseModel):
    name: str


class CLITokenCreate(CLITokenBase):
    expires_days: Optional[int] = 30  # Domyślnie 30 dni


class CLITokenUpdate(BaseModel):
    name: Optional[str] = None
    expires_days: Optional[int] = None  # Przedłużenie tokenu


class CLITokenInDB(CLITokenBase):
    id: int
    user_id: int
    created_at: datetime
    expires_at: datetime
    last_used_at: Optional[datetime] = None
    last_used_ip: Optional[str] = None
    last_used_user_agent: Optional[str] = None
    is_active: bool

    class Config:
        from_attributes = True


class CLITokenResponse(CLITokenInDB):
    """Response model without sensitive data"""

    pass


class CLITokenCreateResponse(BaseModel):
    """Response when creating new token - includes actual token"""

    token: str
    token_info: CLITokenInDB


class CLITokenUsageInfo(BaseModel):
    """Information about token usage"""

    last_used_at: Optional[datetime] = None
    last_used_ip: Optional[str] = None
    last_used_user_agent: Optional[str] = None
    is_active: bool
