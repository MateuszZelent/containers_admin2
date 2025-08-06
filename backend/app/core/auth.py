from typing import Generator, Optional
from datetime import datetime, timedelta, timezone
from fastapi import Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordBearer
from jose import jwt, JWTError
from sqlalchemy.orm import Session
from pydantic import ValidationError

from app.core.config import settings
from app.core.security import verify_password
from app.core.logging import logger
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
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(
        to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM
    )
    return encoded_jwt


def get_current_user_with_cli_support(
    request: Request, db: Session = Depends(get_db), token: str = Depends(oauth2_scheme)
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
        raise HTTPException(status_code=404, detail="Default admin user not found")

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

        cli_token_service.update_token_usage(cli_token, client_ip, user_agent)

        return cli_token.owner

    # If neither JWT nor CLI token worked
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Could not validate credentials",
    )


def get_current_user(
    db: Session = Depends(get_db), token: str = Depends(oauth2_scheme)
) -> User:
    print(f"DEBUG AUTH: get_current_user called with token: {token[:20] if token else 'None'}...")
    
    # Jeśli autoryzacja jest wyłączona, zwracamy domyślnego użytkownika (admin)
    if settings.DISABLE_AUTH:
        admin_user = UserService.get_by_username(db, username="admin")
        if admin_user:
            print(f"DEBUG AUTH: Auth disabled, returning admin user: {admin_user.username} (id={admin_user.id})")
            return admin_user
        # Jeśli nie ma admina, warto zgłosić błąd, bo to powinien być domyślny użytkownik
        raise HTTPException(status_code=404, detail="Default admin user not found")

    # Standardowa autoryzacja, gdy DISABLE_AUTH=False
    try:
        payload = jwt.decode(
            token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM]
        )
        token_data = TokenPayload(**payload)
        print(f"DEBUG AUTH: Token decoded successfully, username: {token_data.sub}")
    except (JWTError, ValidationError) as e:
        print(f"DEBUG AUTH: Token validation failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Could not validate credentials",
        )
        
    user = UserService.get_by_username(db, username=token_data.sub)
    if not user:
        print(f"DEBUG AUTH: User not found for username: {token_data.sub}")
        raise HTTPException(status_code=404, detail="User not found")
    print(f"DEBUG AUTH: User found: {user.username} (id={user.id}, is_active={user.is_active})")
    return user


def get_current_active_user(
    current_user: User = Depends(get_current_user),
) -> User:
    logger.debug(f"DEBUG AUTH: get_current_active_user called with user: {current_user.username} (id={current_user.id})")
    logger.info(f"🔐 AUTH FLOW: get_current_active_user called for endpoint - user: {current_user.username}")
    if not current_user.is_active:
        logger.error(f"DEBUG AUTH: User {current_user.username} is not active!")
        raise HTTPException(status_code=400, detail="Inactive user")
    logger.debug(f"DEBUG AUTH: User {current_user.username} is active, returning")
    return current_user


def get_current_active_user_with_cli_support(
    request: Request,
    current_user: User = Depends(get_current_user_with_cli_support),
) -> User:
    """Get current active user with CLI token support"""
    if not settings.DISABLE_AUTH and not current_user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")
    return current_user


def get_current_superuser(
    current_user: User = Depends(get_current_active_user),
) -> User:
    """Dependency that ensures current user is a superuser"""
    if not current_user.is_superuser:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="The user doesn't have enough privileges",
        )
    return current_user


def get_current_superuser_with_cli_support(
    request: Request,
    current_user: User = Depends(get_current_active_user_with_cli_support),
) -> User:
    """Dependency that ensures current user is a superuser with CLI support"""
    if not current_user.is_superuser:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="The user doesn't have enough privileges",
        )
    return current_user


async def get_current_user_websocket(token: Optional[str], db: Session) -> User:
    """Authenticate websocket connections using JWT or CLI tokens."""
    print(f"DEBUG WS AUTH: get_current_user_websocket called with token: {token[:20] if token else 'None'}...")

    # Allow anonymous access if auth disabled
    if settings.DISABLE_AUTH:
        admin_user = UserService.get_by_username(db, username="admin")
        if admin_user:
            print(f"DEBUG WS AUTH: Auth disabled, returning admin user: {admin_user.username}")
            return admin_user
        raise HTTPException(status_code=404, detail="Default admin user not found")

    if not token:
        print("DEBUG WS AUTH: No token provided!")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    print(f"DEBUG WS AUTH: Trying JWT decode with token: {token[:20]}...")
    # Try JWT authentication first
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        token_data = TokenPayload(**payload)
        print(f"DEBUG WS AUTH: JWT decoded successfully, username: {token_data.sub}")
        if token_data.sub:
            user = UserService.get_by_username(db, username=token_data.sub)
            if user:
                print(f"DEBUG WS AUTH: User found: {user.username} (id={user.id})")
                return user
    except (JWTError, ValidationError) as e:
        print(f"DEBUG WS AUTH: JWT validation failed: {e}")
        pass

    print("DEBUG WS AUTH: Trying CLI token...")
    # Fall back to CLI token authentication
    cli_token_service = CLITokenService(db)
    cli_token = cli_token_service.verify_token(token)
    if cli_token and cli_token.owner:
        print(f"DEBUG WS AUTH: CLI token valid for user: {cli_token.owner.username}")
        return cli_token.owner

    print("DEBUG WS AUTH: All authentication methods failed!")
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Could not validate credentials",
    )
