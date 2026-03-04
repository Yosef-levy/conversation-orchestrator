"""
Pytest configuration and shared fixtures for backend tests.

Uses a dedicated in-memory SQLite engine with StaticPool so the same connection
is shared for table creation and for request handling (TestClient can run in
another thread). Overrides the app's get_session so API tests use this engine.
"""
import os
import sys

# Ensure we can import app from project root.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlmodel import SQLModel, create_engine, Session
from sqlalchemy.pool import StaticPool

# Test-only engine: single connection so :memory: is shared everywhere.
test_engine = create_engine(
    "sqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)

# Register models and create tables on the test engine (not app.db).
from app import models  # noqa: F401

SQLModel.metadata.create_all(test_engine)


def get_test_session():
    """Yield a session from the test engine. Used to override app's get_session."""
    with Session(test_engine) as session:
        yield session


import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def app():
    """App with get_session overridden to use the test engine."""
    from app.main import create_app
    from app.db import get_session

    app = create_app()
    app.dependency_overrides[get_session] = get_test_session
    return app


@pytest.fixture
def client(app):
    """TestClient using the app with test DB."""
    return TestClient(app)
