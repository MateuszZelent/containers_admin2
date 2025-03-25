#!/usr/bin/env python3
import sys
import os
import importlib
import traceback
from sqlalchemy import text

def check_module_import(module_name):
    try:
        importlib.import_module(module_name)
        print(f"[OK] Module '{module_name}' imported successfully")
        return True
    except Exception as e:
        print(f"[ERROR] Failed to import module '{module_name}': {e}")
        traceback.print_exc()
        return False

def main():
    print("=== FastAPI Backend Diagnostic Tool ===")
    print(f"Python version: {sys.version}")
    print(f"Working directory: {os.getcwd()}")
    print("\n=== Checking critical imports ===")
    
    # Sprawdź kluczowe moduły
    modules = [
        "fastapi", 
        "sqlalchemy", 
        "alembic",
        "email_validator",  # Sprawdźmy, czy email-validator jest dostępny
        "app.db.session"
    ]
    
    failures = 0
    for module in modules:
        if not check_module_import(module):
            failures += 1
    
    # Sprawdź połączenie z bazą danych
    print("\n=== Checking database connection ===")
    try:
        from app.db.session import SessionLocal
        db = SessionLocal()
        # Użyj text() dla zapytań SQL
        db.execute(text("SELECT 1"))
        print("[OK] Database connection successful")
    except Exception as e:
        print(f"[ERROR] Database connection failed: {e}")
        traceback.print_exc()
        failures += 1
    
    print(f"\n=== Diagnostics completed with {failures} failures ===")
    
if __name__ == "__main__":
    main()
