from sqlalchemy import text
from sqlmodel import SQLModel, create_engine, Session

from .config import get_settings


settings = get_settings()
engine = create_engine(
    settings.database_url, connect_args={"check_same_thread": False}
)


def init_db() -> None:
    """Create all tables and run simple migrations for existing DBs."""
    SQLModel.metadata.create_all(engine)
    # Add pinned column if missing (e.g. existing DBs created before pin feature)
    with engine.connect() as conn:
        if "sqlite" in (engine.url.drivername or ""):
            r = conn.execute(text(
                "SELECT 1 FROM pragma_table_info('conversations') WHERE name='pinned'"
            ))
            if r.scalar() is None:
                conn.execute(text(
                    "ALTER TABLE conversations ADD COLUMN pinned BOOLEAN DEFAULT 0"
                ))
                conn.commit()


def get_session() -> Session:
    with Session(engine) as session:
        yield session

