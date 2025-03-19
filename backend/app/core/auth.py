from typing import Generator, Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import jwt, JWTError
from sqlalchemy.orm import Session
from pydantic import ValidationError

from app.core.config import settings
from app.core.security import verify_password
from app.db.session import get_db
from app.schemas.token import TokenPayload
from app.services.user import UserService
from app.db.models import User

# Używamy optional=True, aby umożliwić nieautoryzowane żądania, gdy DISABLE_AUTH=True
oauth2_scheme = OAuth2PasswordBearer(tokenUrl=f"{settings.API_V1_STR}/auth/login", auto_error=not settings.DISABLE_AUTH)


def get_current_user(
    db: Session = Depends(get_db), token: str = Depends(oauth2_scheme)
) -> User:
    # Jeśli autoryzacja jest wyłączona, zwracamy domyślnego użytkownika (admin)
    if settings.DISABLE_AUTH:
        admin_user = UserService.get_by_username(db, username="admin")
        if admin_user:
            return admin_user
        # Jeśli nie ma admina, warto zgłosić błąd, bo to powinien być domyślny użytkownik
        raise HTTPException(status_code=404, detail="Default admin user not found")
        
    # Standardowa autoryzacja, gdy DISABLE_AUTH=False
    try:
        payload = jwt.decode(
            token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM]
        )
        token_data = TokenPayload(**payload)
    except (JWTError, ValidationError):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Could not validate credentials",
        )
    user = UserService.get_by_username(db, username=token_data.sub)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


def get_current_active_user(
    current_user: User = Depends(get_current_user),
) -> User:
    if not settings.DISABLE_AUTH and not current_user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")
    return current_user