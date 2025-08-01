from typing import Any, List
import os
import shutil
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from PIL import Image

from pydantic import BaseModel

from app.core.auth import get_current_active_user, get_current_superuser
from app.db.session import get_db
from app.schemas.user import User, UserCreate, UserUpdate, UserWithUsage
from app.services.user import UserService
from app.db.models import User as UserModel
from app.websocket.manager import websocket_manager
from app.core.utils import get_avatar_url, make_avatar_url_absolute

router = APIRouter()


@router.post("/", response_model=User)
def create_user(
    *,
    db: Session = Depends(get_db),
    user_in: UserCreate,
) -> Any:
    """
    Create new user.
    """
    user = UserService.get_by_email(db, email=user_in.email)
    if user:
        raise HTTPException(
            status_code=400,
            detail="The user with this email already exists in the system.",
        )
    user = UserService.get_by_username(db, username=user_in.username)
    if user:
        raise HTTPException(
            status_code=400,
            detail="The user with this username already exists in the system.",
        )
    user = UserService.create(db, user_in=user_in)
    return user


@router.get("/me", response_model=User)
def read_user_me(
    *,
    db: Session = Depends(get_db),
    include_usage: bool = False,
    current_user: UserModel = Depends(get_current_active_user),
) -> Any:
    """
    Get current user with optional usage information.
    
    Args:
        include_usage: If True, includes current resource usage statistics
    """
    if include_usage:
        from app.services.user import UserService
        usage_data = UserService.get_user_current_usage(db, current_user)
        
        # Convert user model to dict and add usage
        user_dict = {
            "id": current_user.id,
            "username": current_user.username,
            "email": current_user.email,
            "first_name": current_user.first_name,
            "last_name": current_user.last_name,
            "max_containers": current_user.max_containers,
            "max_gpus": current_user.max_gpus,
            "max_gpus_per_job": current_user.max_gpus_per_job,
            "max_time_limit_hours": current_user.max_time_limit_hours,
            "allowed_templates": current_user.allowed_templates,
            "avatar_url": current_user.avatar_url,
            "preferred_language": current_user.preferred_language,
            "is_active": current_user.is_active,
            "is_superuser": current_user.is_superuser,
            "code_server_password": current_user.code_server_password,
            "current_usage": usage_data
        }
        return user_dict
    
    return current_user


@router.get("/me/usage")
def get_user_usage(
    *,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_active_user),
) -> Any:
    """
    Get current user's resource usage and limits.
    """
    from app.services.user import UserService
    
    usage_data = UserService.get_user_current_usage(db, current_user)
    return usage_data


@router.put("/me", response_model=User)
def update_user_me(
    *,
    db: Session = Depends(get_db),
    user_in: UserUpdate,
    current_user: UserModel = Depends(get_current_active_user),
) -> Any:
    """
    Update own user.
    """
    user = UserService.update(db, user=current_user, user_in=user_in)
    return user


@router.get("/active", response_model=List[User])
def get_active_users(db: Session = Depends(get_db)) -> Any:
    """Return list of currently active users based on websocket connections."""
    user_ids = list(websocket_manager.user_connections.keys())
    active_users = []
    for user_id in user_ids:
        try:
            uid = int(user_id)
        except (TypeError, ValueError):
            continue
        user = UserService.get(db, user_id=uid)
        if user:
            active_users.append(user)
    return active_users


# Admin-only endpoints
@router.get("/", response_model=List[User])
def read_users(
    db: Session = Depends(get_db),
    skip: int = 0,
    limit: int = 100,
    current_user: UserModel = Depends(get_current_superuser),
) -> Any:
    """
    Retrieve all users. Admin only.
    """
    users = UserService.get_multi(db, skip=skip, limit=limit)
    return users


@router.post("/admin", response_model=User)
def create_user_by_admin(
    *,
    db: Session = Depends(get_db),
    user_in: UserCreate,
    current_user: UserModel = Depends(get_current_superuser),
) -> Any:
    """
    Create new user by admin.
    """
    user = UserService.get_by_email(db, email=user_in.email)
    if user:
        raise HTTPException(
            status_code=400,
            detail="The user with this email already exists in the system.",
        )
    user = UserService.get_by_username(db, username=user_in.username)
    if user:
        raise HTTPException(
            status_code=400,
            detail="The user with this username already exists in the system.",
        )
    user = UserService.create(db, user_in=user_in)
    return user


@router.get("/{user_id}", response_model=User)
def read_user_by_id(
    user_id: int,
    current_user: UserModel = Depends(get_current_superuser),
    db: Session = Depends(get_db),
) -> Any:
    """
    Get a specific user by id. Admin only.
    """
    user = UserService.get(db, user_id=user_id)
    if not user:
        raise HTTPException(
            status_code=404, detail="The user with this ID does not exist in the system"
        )
    return user


@router.put("/{user_id}", response_model=User)
def update_user(
    *,
    db: Session = Depends(get_db),
    user_id: int,
    user_in: UserUpdate,
    current_user: UserModel = Depends(get_current_superuser),
) -> Any:
    """
    Update a user. Admin only.
    """
    user = UserService.get(db, user_id=user_id)
    if not user:
        raise HTTPException(
            status_code=404,
            detail="The user with this ID does not exist in the system",
        )
    user = UserService.update(db, user=user, user_in=user_in)
    return user


@router.delete("/{user_id}")
def delete_user(
    *,
    db: Session = Depends(get_db),
    user_id: int,
    current_user: UserModel = Depends(get_current_superuser),
) -> Any:
    """
    Delete a user. Admin only.
    """
    user = UserService.get(db, user_id=user_id)
    if not user:
        raise HTTPException(
            status_code=404,
            detail="The user with this ID does not exist in the system",
        )
    if user.id == current_user.id:
        raise HTTPException(status_code=400, detail="Users cannot delete themselves")
    user = UserService.remove(db, user_id=user_id)
    return {"message": "User deleted successfully"}


@router.post("/me/avatar")
async def upload_avatar(
    *,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_active_user),
    file: UploadFile = File(...)
) -> Any:
    """
    Upload avatar for current user.
    """
    # Validate file type
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(
            status_code=400, 
            detail="File must be an image (jpg, png, gif, etc.)"
        )
    
    # Validate file size (max 2MB)
    MAX_SIZE = 2 * 1024 * 1024  # 2MB
    file_content = await file.read()
    if len(file_content) > MAX_SIZE:
        raise HTTPException(
            status_code=400,
            detail="File size must be less than 2MB"
        )
    
    try:
        # Reset file pointer
        await file.seek(0)
        
        # Create avatars directory if it doesn't exist
        avatars_dir = Path("static/avatars")
        avatars_dir.mkdir(parents=True, exist_ok=True)
        
        # Generate filename
        file_extension = file.filename.split(".")[-1].lower() if file.filename else "jpg"
        avatar_filename = f"{current_user.username}.{file_extension}"
        avatar_path = avatars_dir / avatar_filename
        
        # Open and process image with PIL
        image = Image.open(file.file)
        
        # Convert to RGB if necessary (for PNG with transparency)
        if image.mode in ("RGBA", "P"):
            image = image.convert("RGB")
        
        # Resize to 128x128 (square avatar)
        image = image.resize((128, 128), Image.Resampling.LANCZOS)
        
        # Save processed image
        image.save(avatar_path, "JPEG", quality=90)
        
        # Update user avatar_url in database
        avatar_url = get_avatar_url(avatar_filename)
        user_update = UserUpdate(avatar_url=avatar_url)
        UserService.update(db, user=current_user, user_in=user_update)
        
        return {"message": "Avatar uploaded successfully", "avatar_url": avatar_url}
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to process avatar: {str(e)}"
        )


@router.delete("/me/avatar")
def delete_avatar(
    *,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_active_user),
) -> Any:
    """
    Delete avatar for current user.
    """
    try:
        # Remove file if it exists
        if current_user.avatar_url:
            avatar_path = Path(current_user.avatar_url.lstrip("/"))
            if avatar_path.exists():
                os.unlink(avatar_path)
        
        # Update user avatar_url in database
        user_update = UserUpdate(avatar_url=None)
        UserService.update(db, user=current_user, user_in=user_update)
        
        return {"message": "Avatar deleted successfully"}
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to delete avatar: {str(e)}"
        )


class LanguageUpdate(BaseModel):
    preferred_language: str


@router.put("/me/language", response_model=User)
def update_user_language(
    *,
    db: Session = Depends(get_db),
    language_data: LanguageUpdate,
    current_user: UserModel = Depends(get_current_active_user),
) -> Any:
    """
    Update user's preferred language.
    Supported languages: pl, en
    """
    # Validate language
    supported_languages = ["pl", "en"]
    if language_data.preferred_language not in supported_languages:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported language. Use one of: {supported_languages}"
        )
    
    # Update user language
    user_update = UserUpdate(
        preferred_language=language_data.preferred_language
    )
    user = UserService.update(db, user=current_user, user_in=user_update)
    return user
