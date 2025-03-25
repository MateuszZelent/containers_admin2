from pydantic import BaseModel
from typing import Optional

# Używaj wbudowanego str zamiast EmailStr
class UserBase(BaseModel):
    username: str
    email: Optional[str] = None  # Zmienione z EmailStr na str
    first_name: Optional[str] = None
    last_name: Optional[str] = None


class UserCreate(UserBase):
    password: str


class UserUpdate(UserBase):
    password: Optional[str] = None
    username: Optional[str] = None
    email: Optional[str] = None
    code_server_password: Optional[str] = None  # Added this field


class UserInDBBase(UserBase):
    id: Optional[int] = None
    is_active: bool = True
    is_superuser: Optional[bool] = False
    code_server_password: Optional[str] = None  # Added this field

    class Config:
        from_attributes = True


class User(UserInDBBase):
    pass


class UserInDB(UserInDBBase):
    hashed_password: str