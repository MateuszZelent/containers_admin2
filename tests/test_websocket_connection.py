import sys
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

class DummyUser:
    id = 1
    username = "tester"

@pytest.fixture
def client(monkeypatch):
    sys.path.insert(0, 'backend')

    from app.db import session as session_mod
    def fake_get_db():
        class DummyDB:
            def close(self):
                pass
        yield DummyDB()
    monkeypatch.setattr(session_mod, 'get_db', fake_get_db)

    from app.core import auth
    async def fake_get_current_user_websocket(token, db):
        return DummyUser()
    monkeypatch.setattr(auth, 'get_current_user_websocket', fake_get_current_user_websocket)

    from app.websocket.routes import router

    app = FastAPI()
    app.include_router(router)

    with TestClient(app) as c:
        yield c


def test_websocket_job_status(client):
    with client.websocket_connect('/ws/jobs/status?token=dummy') as websocket:
        data = websocket.receive_json()
        assert data['type'] == 'connection_established'
        assert data['channel'] == 'job_status'
