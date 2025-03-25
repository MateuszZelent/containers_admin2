from sqlalchemy import text
from sqlalchemy.orm import Session

def check_database_connection(db: Session) -> bool:
    """Sprawdza połączenie z bazą danych"""
    try:
        # Użyj text() dla zapytań SQL
        db.execute(text("SELECT 1"))
        return True
    except Exception:
        return False

def get_database_info(db: Session) -> dict:
    """Pobiera informacje o bazie danych"""
    try:
        # Użyj text() dla wszystkich zapytań SQL
        version = db.execute(text("SELECT version()")).scalar()
        
        # Sprawdź tabele
        tables_query = """
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public'
        """
        tables = [row[0] for row in db.execute(text(tables_query)).fetchall()]
        
        # Sprawdź użytkowników
        users_query = """
        SELECT usename, usesuper 
        FROM pg_user
        """
        users = {row[0]: {"is_superuser": row[1]} for row in db.execute(text(users_query)).fetchall()}
        
        return {
            "version": version,
            "tables": tables,
            "users": users
        }
    except Exception as e:
        return {"error": str(e)}
