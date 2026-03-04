from sqlmodel import SQLModel, create_engine, Session

from .config import get_settings


settings = get_settings()
engine = create_engine(
    settings.database_url, connect_args={"check_same_thread": False}
)


def init_db() -> None:
    """Create all tables."""
    SQLModel.metadata.create_all(engine)


def get_session() -> Session:
    with Session(engine) as session:
        yield session

