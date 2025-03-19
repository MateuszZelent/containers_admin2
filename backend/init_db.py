import os
import sys
from sqlalchemy import text

# Add the current directory to the Python path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.db.session import engine, get_db
from app.db.models import Base
from app.services.user import UserService
from app.schemas.user import UserCreate


def init_db() -> None:
    # Create tables
    Base.metadata.create_all(bind=engine)
    
    # Get DB session
    db = next(get_db())
    
    # Check if there are any users
    result = db.execute(text("SELECT COUNT(*) FROM users")).scalar()
    
    if result == 0:
        print("Creating initial admin user...")
        user_in = UserCreate(
            username="admin",
            email="admin@example.com",
            password="adminpassword"  # Change this in production!
        )
        UserService.create(db=db, user_in=user_in)
        print("Admin user created. Username: admin, Password: adminpassword")
    else:
        print("Database already initialized with users.")


if __name__ == "__main__":
    print("Initializing database...")
    init_db()
    print("Database initialization completed.")