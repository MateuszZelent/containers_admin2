from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

# Najpierw zdefiniuj aplikację FastAPI
app = FastAPI(
    title="Containers Admin API",
    description="API for managing containers in AMU clusters",
    version="1.0.0",
)

# Prosty endpoint zdrowia
@app.get("/health")
async def health_check():
    from app.db.session import SessionLocal
    db = SessionLocal()
    try:
        # Sprawdź połączenie z bazą danych
        db.execute(text("SELECT 1"))
        return {"status": "ok", "database_connection": True}
    except Exception as e:
        return {"status": "error", "error": str(e), "database_connection": False}

# Endpoint bazowy 
@app.get("/")
async def root():
    return {"message": "Welcome to Containers Admin API"}

# Dodaj obsługę CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # W środowisku produkcyjnym należy tu określić dozwolone domeny
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Teraz możesz bezpiecznie używać middleware
@app.middleware("http")
async def log_requests(request, call_next):
    print(f"Request: {request.method} {request.url}")
    response = await call_next(request)
    print(f"Response: {request.method} {request.url} - Status: {response.status_code}")
    return response

# Importy routerów - z obsługą wyjątków
try:
    from app.routers import users, auth, jobs
    
    # Rejestracja routerów
    app.include_router(auth.router, prefix="/api/v1", tags=["auth"])
    app.include_router(users.router, prefix="/api/v1/users", tags=["users"])
    app.include_router(jobs.router, prefix="/api/v1/jobs", tags=["jobs"])
except ImportError as e:
    print(f"Warning: Could not import routers: {e}")

# Event startowy aplikacji
@app.on_event("startup")
async def startup_event():
    logger.info("Application startup completed")
