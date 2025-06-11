from datetime import timedelta
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from app.core.auth import (
    authenticate_user,
    create_access_token,
    get_current_active_user_with_cli_support,
)
from app.core.config import settings
from app.db.session import get_db
from app.schemas.token import Token, CLITokenLogin, CLITokenVerify
from app.services.cli_token import CLITokenService
from app.db.models import User

router = APIRouter()


@router.post("/login", response_model=Token)
async def login(
    db: Session = Depends(get_db),
    form_data: OAuth2PasswordRequestForm = Depends()
) -> Any:
    """
    OAuth2 compatible token login, get an access token for future requests.
    """
    user = authenticate_user(db, form_data.username, form_data.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token_expires = timedelta(
        minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
    )
    access_token = create_access_token(
        data={"sub": user.username}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}


@router.post("/cli-login", response_model=Token)
async def login_with_cli_token(
    request: CLITokenLogin,
    db: Session = Depends(get_db)
) -> Any:
    """
    Login using CLI token and get a JWT access token.
    This endpoint allows mmpp CLI library to authenticate using CLI tokens.
    """
    cli_token_service = CLITokenService(db)
    cli_token = cli_token_service.verify_token(request.cli_token)
    
    if not cli_token or not cli_token.owner:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid CLI token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    if not cli_token.owner.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User account is inactive"
        )
    
    # Update token usage
    client_ip = (
        "cli" if not hasattr(request, 'client')
        else getattr(request.client, 'host', 'unknown')
    )
    cli_token_service.update_token_usage(cli_token, client_ip, "mmpp-cli")
    
    # Create JWT token
    access_token_expires = timedelta(
        minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
    )
    access_token = create_access_token(
        data={"sub": cli_token.owner.username},
        expires_delta=access_token_expires
    )
    
    return {"access_token": access_token, "token_type": "bearer"}


# @router.get("/verify")
# async def verify_token(
#     request: Request,
#     current_user: User = Depends(get_current_active_user_with_cli_support),
# ) -> Any:
#     """
#     Verify if the token (JWT or CLI) is still valid.
#     Returns user information if token is valid.
#     """
#     return {
#         "valid": True,
#         "user": {
#             "id": current_user.id,
#             "username": current_user.username,
#             "email": current_user.email,
#             "is_active": current_user.is_active,
#             "is_superuser": current_user.is_superuser,
#         },
#     }


@router.get("/me")
async def get_current_user_info(
    request: Request,
    current_user: User = Depends(get_current_active_user_with_cli_support),
) -> Any:
    """
    Get current user information with resource limits
    (works with both JWT and CLI tokens).
    """
    return {
        "id": current_user.id,
        "username": current_user.username,
        "email": current_user.email,
        "first_name": current_user.first_name,
        "last_name": current_user.last_name,
        "is_active": current_user.is_active,
        "is_superuser": current_user.is_superuser,
        "created_at": current_user.created_at,
        "updated_at": current_user.updated_at,
        "max_containers": current_user.max_containers or 6,
        "max_gpus": current_user.max_gpus or 24,
    }
