import secrets
import hashlib
from datetime import datetime, timedelta
from typing import List, Optional
from sqlalchemy.orm import Session
from fastapi import HTTPException, status

from app.db.models import CLIToken, User
from app.schemas.cli_token import CLITokenCreate, CLITokenUpdate
from app.core.logging import cluster_logger


class CLITokenService:
    def __init__(self, db: Session):
        self.db = db

    @staticmethod
    def generate_token() -> str:
        """Generate a secure random token"""
        return secrets.token_urlsafe(32)

    @staticmethod
    def hash_token(token: str) -> str:
        """Hash token for storage"""
        return hashlib.sha256(token.encode()).hexdigest()

    def create_token(
        self, user: User, token_data: CLITokenCreate
    ) -> tuple[str, CLIToken]:
        """Create new CLI token for user"""
        # Generate new token
        raw_token = self.generate_token()
        token_hash = self.hash_token(raw_token)

        # Calculate expiration date
        expires_at = datetime.utcnow() + timedelta(days=token_data.expires_days or 30)

        # Create token record
        db_token = CLIToken(
            token_hash=token_hash,
            name=token_data.name,
            user_id=user.id,
            expires_at=expires_at,
            is_active=True,
        )

        self.db.add(db_token)
        self.db.commit()
        self.db.refresh(db_token)

        cluster_logger.info(
            f"Created CLI token '{token_data.name}' for user {user.username}"
        )

        return raw_token, db_token

    def get_user_tokens(self, user_id: int) -> List[CLIToken]:
        """Get all tokens for a user"""
        return (
            self.db.query(CLIToken)
            .filter(CLIToken.user_id == user_id)
            .order_by(CLIToken.created_at.desc())
            .all()
        )

    def get_token_by_id(self, token_id: int, user_id: int) -> Optional[CLIToken]:
        """Get token by ID for specific user"""
        return (
            self.db.query(CLIToken)
            .filter(CLIToken.id == token_id, CLIToken.user_id == user_id)
            .first()
        )

    def verify_token(self, raw_token: str) -> Optional[CLIToken]:
        """Verify token and return token record if valid"""
        token_hash = self.hash_token(raw_token)

        token = (
            self.db.query(CLIToken)
            .filter(
                CLIToken.token_hash == token_hash,
                CLIToken.is_active == True,
                CLIToken.expires_at > datetime.utcnow(),
            )
            .first()
        )

        return token

    def update_token_usage(self, token: CLIToken, ip_address: str, user_agent: str):
        """Update token usage information"""
        token.last_used_at = datetime.utcnow()
        token.last_used_ip = ip_address
        token.last_used_user_agent = user_agent
        self.db.commit()

    def update_token(
        self, token_id: int, user_id: int, token_data: CLITokenUpdate
    ) -> CLIToken:
        """Update token information"""
        token = self.get_token_by_id(token_id, user_id)
        if not token:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Token not found"
            )

        if token_data.name is not None:
            token.name = token_data.name

        if token_data.expires_days is not None:
            # Extend token expiration
            token.expires_at = datetime.utcnow() + timedelta(
                days=token_data.expires_days
            )

        self.db.commit()
        self.db.refresh(token)

        cluster_logger.info(f"Updated CLI token {token_id} for user {user_id}")

        return token

    def deactivate_token(self, token_id: int, user_id: int) -> bool:
        """Deactivate (delete) token"""
        token = self.get_token_by_id(token_id, user_id)
        if not token:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Token not found"
            )

        token.is_active = False
        self.db.commit()

        cluster_logger.info(f"Deactivated CLI token {token_id} for user {user_id}")

        return True

    def delete_token(self, token_id: int, user_id: int) -> bool:
        """Permanently delete token"""
        token = self.get_token_by_id(token_id, user_id)
        if not token:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Token not found"
            )

        self.db.delete(token)
        self.db.commit()

        cluster_logger.info(f"Deleted CLI token {token_id} for user {user_id}")

        return True

    def cleanup_expired_tokens(self) -> int:
        """Clean up expired tokens - utility function"""
        expired_count = (
            self.db.query(CLIToken)
            .filter(CLIToken.expires_at < datetime.utcnow())
            .count()
        )

        (
            self.db.query(CLIToken)
            .filter(CLIToken.expires_at < datetime.utcnow())
            .delete()
        )

        self.db.commit()

        if expired_count > 0:
            cluster_logger.info(f"Cleaned up {expired_count} expired CLI tokens")

        return expired_count
