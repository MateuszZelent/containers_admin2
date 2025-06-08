from typing import List
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.core.auth import get_current_active_user
from app.db.models import User
from app.schemas.cli_token import (
    CLITokenCreate,
    CLITokenUpdate,
    CLITokenResponse,
    CLITokenCreateResponse,
    CLITokenUsageInfo,
)
from app.services.cli_token import CLITokenService

router = APIRouter()


@router.get("/", response_model=List[CLITokenResponse])
async def get_user_cli_tokens(
    db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)
):
    """Get all CLI tokens for current user"""
    cli_token_service = CLITokenService(db)
    tokens = cli_token_service.get_user_tokens(current_user.id)
    return tokens


@router.post("/", response_model=CLITokenCreateResponse)
async def create_cli_token(
    token_data: CLITokenCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Create new CLI token for current user"""
    cli_token_service = CLITokenService(db)

    # Check if user already has a token with this name
    existing_tokens = cli_token_service.get_user_tokens(current_user.id)
    if any(t.name == token_data.name and t.is_active for t in existing_tokens):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Token with name '{token_data.name}' already exists",
        )

    raw_token, db_token = cli_token_service.create_token(current_user, token_data)

    return CLITokenCreateResponse(token=raw_token, token_info=db_token)


@router.get("/{token_id}", response_model=CLITokenResponse)
async def get_cli_token(
    token_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Get specific CLI token information"""
    cli_token_service = CLITokenService(db)
    token = cli_token_service.get_token_by_id(token_id, current_user.id)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Token not found"
        )
    return token


@router.put("/{token_id}", response_model=CLITokenResponse)
async def update_cli_token(
    token_id: int,
    token_data: CLITokenUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Update CLI token (rename or extend expiration)"""
    cli_token_service = CLITokenService(db)

    # Check for name conflicts if name is being changed
    if token_data.name:
        existing_tokens = cli_token_service.get_user_tokens(current_user.id)
        if any(
            t.name == token_data.name and t.is_active and t.id != token_id
            for t in existing_tokens
        ):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Token with name '{token_data.name}' already exists",
            )

    updated_token = cli_token_service.update_token(
        token_id, current_user.id, token_data
    )
    return updated_token


@router.delete("/{token_id}")
async def delete_cli_token(
    token_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Delete CLI token permanently"""
    cli_token_service = CLITokenService(db)
    success = cli_token_service.delete_token(token_id, current_user.id)
    return {"message": "Token deleted successfully"}


@router.post("/{token_id}/deactivate")
async def deactivate_cli_token(
    token_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Deactivate CLI token (soft delete)"""
    cli_token_service = CLITokenService(db)
    success = cli_token_service.deactivate_token(token_id, current_user.id)
    return {"message": "Token deactivated successfully"}


@router.get("/{token_id}/usage", response_model=CLITokenUsageInfo)
async def get_cli_token_usage(
    token_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Get CLI token usage information"""
    cli_token_service = CLITokenService(db)
    token = cli_token_service.get_token_by_id(token_id, current_user.id)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Token not found"
        )

    return CLITokenUsageInfo(
        last_used_at=token.last_used_at,
        last_used_ip=token.last_used_ip,
        last_used_user_agent=token.last_used_user_agent,
        is_active=token.is_active,
    )


@router.post("/cleanup-expired")
async def cleanup_expired_tokens(
    db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)
):
    """Clean up expired tokens (admin functionality)"""
    if not current_user.is_superuser:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only superusers can cleanup expired tokens",
        )

    cli_token_service = CLITokenService(db)
    cleaned_count = cli_token_service.cleanup_expired_tokens()
    return {"message": f"Cleaned up {cleaned_count} expired tokens"}
