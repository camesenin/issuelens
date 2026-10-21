import os
from collections.abc import Generator

from dotenv import load_dotenv
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import Session, sessionmaker

from models import Base, Issue, Repository, TriageReport, calculate_bounty_xlm, utc_now

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./issuelens.db")

connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(
    DATABASE_URL,
    connect_args=connect_args,
    future=True,
)

SessionLocal = sessionmaker(
    bind=engine,
    autocommit=False,
    autoflush=False,
    expire_on_commit=False,
)


def init_db() -> None:
    """Create all database tables and ensure new Stellar bounty columns exist."""
    Base.metadata.create_all(bind=engine)
    inspector = inspect(engine)
    with engine.begin() as conn:
        if inspector.has_table("issues"):
            issue_cols = {col["name"] for col in inspector.get_columns("issues")}
            if "bounty_xlm" not in issue_cols:
                conn.execute(text("ALTER TABLE issues ADD COLUMN bounty_xlm FLOAT NOT NULL DEFAULT 25.0"))
            if "contributor_stellar_address" not in issue_cols:
                conn.execute(text("ALTER TABLE issues ADD COLUMN contributor_stellar_address VARCHAR(64)"))
            if "bounty_status" not in issue_cols:
                conn.execute(
                    text("ALTER TABLE issues ADD COLUMN bounty_status VARCHAR(32) NOT NULL DEFAULT 'unfunded'")
                )
            if "stellar_tx_hash" not in issue_cols:
                conn.execute(text("ALTER TABLE issues ADD COLUMN stellar_tx_hash VARCHAR(128)"))

        if inspector.has_table("triage_reports"):
            report_cols = {col["name"] for col in inspector.get_columns("triage_reports")}
            if "complexity" not in report_cols:
                conn.execute(
                    text("ALTER TABLE triage_reports ADD COLUMN complexity VARCHAR(32) NOT NULL DEFAULT 'Medium'")
                )
            if "bounty_xlm" not in report_cols:
                conn.execute(
                    text("ALTER TABLE triage_reports ADD COLUMN bounty_xlm FLOAT NOT NULL DEFAULT 75.0")
                )


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency yielding a SQLAlchemy 2.x session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


__all__ = [
    "Base",
    "Issue",
    "Repository",
    "SessionLocal",
    "TriageReport",
    "calculate_bounty_xlm",
    "engine",
    "get_db",
    "init_db",
    "utc_now",
]
