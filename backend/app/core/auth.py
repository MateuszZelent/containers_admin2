from typing import Generator, Optional
from datetime import datetime, timedelta
from fastapi import Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordBearer
from jose import jwt, JWTError
from sqlalchemy.orm import Session
from pydantic import ValidationError

from app.core.config import settings
from app.core.security import verify_password
from app.db.session import get_db
from app.schemas.token import TokenPayload
from app.services.user import UserService
from app.services.cli_token import CLITokenService
from app.db.models import User

# Używamy optional=True, aby umożliwić nieautoryzowane żądania, gdy DISABLE_AUTH=True
oauth2_scheme = OAuth2PasswordBearer(
    tokenUrl=f"{settings.API_V1_STR}/auth/login", auto_error=not settings.DISABLE_AUTH
)


def get_user(db: Session, username: str) -> Optional[User]:
    return db.query(User).filter(User.username == username).first()


def authenticate_user(db: Session, username: str, password: str) -> Optional[User]:
    user = get_user(db, username)
    if not user:
        return None
    if not verify_password(password, user.hashed_password):
        return None
    return user


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(
        to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM
    )
    return encoded_jwt


def get_current_user_with_cli_support(
    request: Request,
    db: Session = Depends(get_db), 
    token: str = Depends(oauth2_scheme)
) -> User:
    """
    Enhanced authentication that supports both JWT tokens and CLI tokens.
    First tries JWT token authentication, then CLI token authentication.
    """
    # Jeśli autoryzacja jest wyłączona, zwracamy domyślnego użytkownika
    if settings.DISABLE_AUTH:
        admin_user = UserService.get_by_username(db, username="admin")
        if admin_user:
            return admin_user
        raise HTTPException(
            status_code=404, 
            detail="Default admin user not found"
        )

    # Try JWT token first (web frontend)
    try:
        payload = jwt.decode(
            token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM]
        )
        token_data = TokenPayload(**payload)
        if token_data.sub:
            user = UserService.get_by_username(db, username=token_data.sub)
            if user:
                return user
    except (JWTError, ValidationError):
        pass  # Will try CLI token next

    # Try CLI token authentication
    cli_token_service = CLITokenService(db)
    cli_token = cli_token_service.verify_token(token)
    
    if cli_token and cli_token.owner:
        # Update token usage information
        client_ip = request.client.host if request.client else "unknown"
        user_agent = request.headers.get("user-agent", "unknown")
        
        cli_token_service.update_token_usage(
            cli_token, client_ip, user_agent
        )
        
        return cli_token.owner

    # If neither JWT nor CLI token worked
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Could not validate credentials",
    )


def get_current_user(
    db: Session = Depends(get_db), 
    token: str = Depends(oauth2_scheme)
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


def get_current_active_user_with_cli_support(
    request: Request,
    current_user: User = Depends(get_current_user_with_cli_support),
) -> User:
    """Get current active user with CLI token support"""
    if not settings.DISABLE_AUTH and not current_user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")
    return current_user
