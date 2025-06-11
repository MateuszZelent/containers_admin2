from pydantic import BaseModel
from typing import Optional


class Token(BaseModel):
    access_token: str
    token_type: str


class TokenPayload(BaseModel):
    sub: Optional[str] = None


class CLITokenLogin(BaseModel):
    """Request model for CLI token authentication"""
    cli_token: str
    
    class Config:
        schema_extra = {
            "example": {
                "cli_token": "ct_1234567890abcdef"
            }
        }


class CLITokenVerify(BaseModel):
    """Request model for CLI token verification without authentication"""
    token: str
    
    class Config:
        schema_extra = {
            "example": {
                "token": "ct_1234567890abcdef or jwt_token_here"
            }
        }


class CLITokenLoginRequest(BaseModel):
    """Request model for CLI token authentication"""
    cli_token: str
    
    class Config:
        schema_extra = {
            "example": {
                "cli_token": "ct_1234567890abcdef"
            }
        }


class CLITokenVerifyRequest(BaseModel):
    """Request model for CLI token verification without authentication"""
    token: str
    
    class Config:
        schema_extra = {
            "example": {
                "token": "ct_1234567890abcdef or jwt_token_here"
            }
        }
